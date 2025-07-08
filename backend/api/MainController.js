import fs from "fs";
import path from "path";
import vision from "@google-cloud/vision";
import XLSX from "xlsx";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "./realmediagroup-ba80ccac0989.json";
const client = new vision.ImageAnnotatorClient();

export default class MainController {
  async extractTextAndSaveToExcel(imagePath, pdfImagePaths = [], excelPath) {
    let tableRows = [];
    const allDateTimes = [];

    const procesarArchivo = async (filePath) => {
      const [result] = await client.documentTextDetection(filePath);
      const fullText = result.fullTextAnnotation;
      if (!fullText) return { tipo: "normal", palabras: [] };

      const textoPlano = fullText.text || "";
      const palabras = [];
      const formatoEspecial = /^\d{1,2}\/\d{1,2}\/\d{4}.*\(1\)/m.test(textoPlano);

      if (formatoEspecial) {
        const lineas = textoPlano.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        const matriz = lineas.map((linea) => {
          const fechaMatch = linea.match(/^\d{1,2}\/\d{1,2}\/\d{4}/);
          if (!fechaMatch) return [];
          const fecha = fechaMatch[0];
          const horasStr = linea.slice(fecha.length).trim();
          const horas = horasStr.split(",").map((h) => {
            const match = h.match(/\d{2}:\d{2}/);
            return match ? match[0] : null;
          }).filter((h) => h !== null);
          return [fecha, ...horas];
        }).filter((row) => row.length > 0);
        return { tipo: "especial", matriz };
      }

      fullText.pages.forEach((page) => {
        page.blocks.forEach((block) => {
          block.paragraphs.forEach((paragraph) => {
            paragraph.words.forEach((word) => {
              const texto = word.symbols.map((s) => s.text).join("");
              const box = word.boundingBox.vertices;
              const centroX = box.reduce((sum, v) => sum + v.x, 0) / 4;
              const centroY = box.reduce((sum, v) => sum + v.y, 0) / 4;
              palabras.push({ texto, centroX, centroY });
            });
          });
        });
      });
      return { tipo: "normal", palabras };
    };

    if (imagePath) {
      const resultado = await procesarArchivo(imagePath);
      if (resultado.tipo === "normal" && resultado.palabras.length > 0) {
        const toleranciaY = 15;
        const filas = [];
        for (const palabra of resultado.palabras) {
          let encontrada = false;
          for (const fila of filas) {
            if (Math.abs(fila.y - palabra.centroY) < toleranciaY) {
              fila.items.push(palabra);
              encontrada = true;
              break;
            }
          }
          if (!encontrada) filas.push({ y: palabra.centroY, items: [palabra] });
        }
        filas.sort((a, b) => a.y - b.y);

        const columnas = [];
        const toleranciaX = 50;
        const centrosGlobalX = resultado.palabras.map((p) => p.centroX).sort((a, b) => a - b);
        for (const x of centrosGlobalX) {
          const colCercana = columnas.find((c) => Math.abs(c - x) < toleranciaX);
          if (!colCercana) columnas.push(x);
        }
        columnas.sort((a, b) => a - b);

        const matrizOCR = filas.map((fila) => {
          const celdas = Array(columnas.length).fill("");
          for (const palabra of fila.items) {
            let minDist = Infinity;
            let colIndex = 0;
            columnas.forEach((colX, idx) => {
              const dist = Math.abs(palabra.centroX - colX);
              if (dist < minDist) {
                minDist = dist;
                colIndex = idx;
              }
            });
            celdas[colIndex] += (celdas[colIndex] ? " " : "") + palabra.texto;
          }
          return celdas;
        });

        const cleanedMatriz = matrizOCR.map((row) =>
          row.map((cell) => cell.trim().replace(/\s+/g, " "))
        );

        const header = cleanedMatriz[0].map((col) => col.toLowerCase());
        const lnIndex = header.indexOf("ln");
        const timeIndex = header.indexOf("time");
        const daysIndex = header.indexOf("days");
        const lenIndex = header.indexOf("len");
        const rateIndex = header.indexOf("rate");
        const noteIndex = header.indexOf("note");

        if (lnIndex === -1 || timeIndex === -1 || daysIndex === -1 || lenIndex === -1 || rateIndex === -1) {
          throw new Error("No se encontraron todas las columnas esperadas en la tabla de la imagen.");
        }

        tableRows = cleanedMatriz.slice(1).map((row, index) => {
          const lnValue = row[lnIndex] && /^\d+$/.test(row[lnIndex]) ? row[lnIndex] : (index + 1).toString();
          return {
            Ln: lnValue,
            Time: row[timeIndex] || "",
            Days: row[daysIndex] ? row[daysIndex].replace(/\s+/g, "") : "",
            Len: row[lenIndex] || "",
            Rate: row[rateIndex] || "",
            Note: noteIndex !== -1 ? row[noteIndex] || "" : "",
          };
        }).filter((row) => row.Time || row.Days);
      }
    }

    for (const pdfImg of pdfImagePaths) {
      const resultado = await procesarArchivo(pdfImg);
      if (resultado.tipo === "especial") {
        for (const block of resultado.matriz) {
          const date = block[0];
          for (const time of block.slice(1)) {
            allDateTimes.push([date, time]);
          }
        }
      }
    }

    if (tableRows.length === 0 || allDateTimes.length === 0) {
      throw new Error("No se detectaron datos suficientes en la imagen o los PDFs.");
    }

    const parseTime = (timeStr) => {
      const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?([ap])/i);
      if (!match) return null;
      let hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      const meridiem = match[3].toLowerCase();
      if (meridiem === "p" && hour !== 12) hour += 12;
      else if (meridiem === "a" && hour === 12) hour = 0;
      return hour * 60 + minute;
    };

    const formatTime = (timeStr) => {
      const [h, m] = timeStr.split(":").map(Number);
      const timeDate = new Date(1970, 0, 1, h, m, 0);
      return timeDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    };

    const findMatchingRow = (date, time) => {
      const timeMatch = time.match(/\d{2}:\d{2}/);
      if (!timeMatch) {
        console.error(`Formato de hora inválido: ${time}`);
        return null;
      }

      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        console.error(`Fecha inválida: ${date}`);
        return null;
      }

      const dayIndex = dateObj.getDay();
      const dayAbbr = ["Su", "M", "Tu", "W", "Th", "F", "Sa"][dayIndex];
      const [h, m] = timeMatch[0].split(":").map(Number);
      const minutes = h * 60 + m;

      for (const row of tableRows) {
        const [startStr, endStr] = row.Time.split(" - ");
        const start = parseTime(startStr);
        const end = parseTime(endStr);
        if (start === null || end === null) continue;

        const isInTimeRange = end === 0 ? minutes >= start : start <= minutes && minutes < end;
        if (isInTimeRange && row.Days.includes(dayAbbr)) {
          return row;
        }
      }
      console.log(`No se encontró coincidencia para ${date} ${time}`);
      return null;
    };

    const dayNamesEs = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    let isciCounter = 1;
    const outputRows = [];

    for (const [date, time] of allDateTimes) {
      const matchingRow = findMatchingRow(date, time);
      if (matchingRow) {
        const dateObj = new Date(date);
        const day = dayNamesEs[dateObj.getDay()];
        const timeStr = formatTime(time);
        const rate = matchingRow.Rate.replace("$", "").trim() + "$";
        const isci = `WebsterBank_WebstersWithYou_3OR_ESP_v${isciCounter.toString().padStart(2, "0")}`;
        outputRows.push([day, date, timeStr, matchingRow.Ln, matchingRow.Len, "WebsterBank", isci, rate]);
        isciCounter++;
      }
    }

    // Definir el encabezado y los datos
    const headerRow = ["DAY", "DATE", "TIME", "LN", "LENGTH", "PRODUCT", "ISCI", "RATE"];
    const dataRows = outputRows;

    // Crear filas para el título y campos adicionales
    const titleRow = ["INVOICE"];
    const invoiceFieldRow = ["", "", "", "", "", "", "Invoice#:"];
    const emptyRow = [];
    const emptyRowsBeforeFields = Array(5).fill(emptyRow); // Filas 3 a 7
    const agencyRow = ["Agency:"];
    const addressRow = ["Address:"];
    const buyerRow = ["Buyer:"];
    const advertiserRow = ["Advertiser:"];
    const productRow = ["Product:"];
    const emptyRowsAfterFields = Array(8).fill(emptyRow); // Filas 13 a 20

    // Combinar todas las filas
    const wsData = [
      titleRow, // Fila 1
      invoiceFieldRow, // Fila 2
      ...emptyRowsBeforeFields, // Filas 3 a 7
      agencyRow, // Fila 8
      addressRow, // Fila 9
      buyerRow, // Fila 10
      advertiserRow, // Fila 11
      productRow, // Fila 12
      ...emptyRowsAfterFields, // Filas 13 a 20
      headerRow, // Fila 21
      ...dataRows // Filas 22 en adelante
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Combinar celdas para el título "INVOICE" de A1 a F1
    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }); // A1:F1

    // Aplicar estilos
    // Título
    const titleCell = "A1";
    if (ws[titleCell]) {
      ws[titleCell].s = { font: { bold: true }, alignment: { horizontal: "center" } };
    }

    // Campos adicionales en negritas
    const boldCells = ["A8", "A9", "A10", "A11", "A12", "G2"];
    boldCells.forEach((cell) => {
      if (ws[cell]) {
        ws[cell].s = { font: { bold: true } };
      }
    });

    XLSX.utils.book_append_sheet(wb, ws, "Contenido");
    XLSX.writeFile(wb, excelPath);
  }
}


/*
import fs from "fs";
import path from "path";
import vision from "@google-cloud/vision";
import XLSX from "xlsx";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "./realmediagroup-ba80ccac0989.json";
const client = new vision.ImageAnnotatorClient();

export default class MainController {
  async extractTextAndSaveToExcel(imagePath, pdfImagePaths = [], excelPath) {
    const allPalabras = [];
    const bloquesEspeciales = [];

    const procesarArchivo = async (filePath) => {
      const [result] = await client.documentTextDetection(filePath);
      const fullText = result.fullTextAnnotation;
      if (!fullText) return [];

      const textoPlano = fullText.text || "";
      const palabras = [];

      const formatoEspecial = /^\d{1,2}\/\d{1,2}\/\d{4}.*\(1\)/m.test(textoPlano);
      if (formatoEspecial) {
        const lineas = textoPlano.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const matriz = lineas.map(linea => {
          const [fecha, ...resto] = linea.split(',');
          return [fecha.trim(), ...resto.map(x => x.trim())];
        });
        return { tipo: 'especial', matriz };
      }

      fullText.pages.forEach(page => {
        page.blocks.forEach(block => {
          block.paragraphs.forEach(paragraph => {
            paragraph.words.forEach(word => {
              const texto = word.symbols.map(s => s.text).join('');
              const box = word.boundingBox.vertices;
              const centroX = box.reduce((sum, v) => sum + v.x, 0) / 4;
              const centroY = box.reduce((sum, v) => sum + v.y, 0) / 4;
              palabras.push({ texto, centroX, centroY });
            });
          });
        });
      });

      return { tipo: 'normal', palabras };
    };

    const agregarImagen = async (filePath) => {
      const resultado = await procesarArchivo(filePath);
      if (resultado.tipo === 'especial') bloquesEspeciales.push(...resultado.matriz);
      else allPalabras.push(...resultado.palabras);
    };

    if (imagePath) await agregarImagen(imagePath);
    for (const pdfImg of pdfImagePaths) {
      await agregarImagen(pdfImg);
    }

    if (allPalabras.length === 0 && bloquesEspeciales.length === 0) {
      throw new Error("❌ No se detectó texto últil en imagen ni PDF convertido a imagen.");
    }

    const toleranciaY = 12;
    const filas = [];

    for (const palabra of allPalabras) {
      let encontrada = false;
      for (const fila of filas) {
        if (Math.abs(fila.y - palabra.centroY) < toleranciaY) {
          fila.items.push(palabra);
          encontrada = true;
          break;
        }
      }
      if (!encontrada) filas.push({ y: palabra.centroY, items: [palabra] });
    }

    filas.sort((a, b) => a.y - b.y);

    const centrosGlobalX = allPalabras.map(p => p.centroX).sort((a, b) => a - b);
    const columnas = [];
    const toleranciaX = 35;

    for (const x of centrosGlobalX) {
      const colCercana = columnas.find(c => Math.abs(c - x) < toleranciaX);
      if (!colCercana) columnas.push(x);
    }

    columnas.sort((a, b) => a - b);

    const matrizOCR = filas.map(fila => {
      const celdas = Array(columnas.length).fill("");
      for (const palabra of fila.items) {
        let minDist = Infinity;
        let colIndex = 0;
        columnas.forEach((colX, idx) => {
          const dist = Math.abs(palabra.centroX - colX);
          if (dist < minDist) {
            minDist = dist;
            colIndex = idx;
          }
        });
        celdas[colIndex] += (celdas[colIndex] ? " " : "") + palabra.texto;
      }
      return celdas;
    });

    const matrizFinal = [
      ...matrizOCR,
      ...(matrizOCR.length && bloquesEspeciales.length ? [[" "]] : []),
      ...bloquesEspeciales
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(matrizFinal);
    XLSX.utils.book_append_sheet(wb, ws, "Contenido");

    XLSX.writeFile(wb, excelPath);
  }
}

*/



/*

import fs from "fs";
import path from "path";
import vision from "@google-cloud/vision";
import XLSX from "xlsx";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "./realmediagroup-ba80ccac0989.json";
const client = new vision.ImageAnnotatorClient();

export default class MainController {
  async extractTextAndSaveToExcel(imagePath, pdfImagePaths = [], excelPath) {
    let tableRows = [];
    const allDateTimes = [];

    const procesarArchivo = async (filePath) => {
      const [result] = await client.documentTextDetection(filePath);
      const fullText = result.fullTextAnnotation;
      if (!fullText) return { tipo: "normal", palabras: [] };

      const textoPlano = fullText.text || "";
      const palabras = [];
      const formatoEspecial = /^\d{1,2}\/\d{1,2}\/\d{4}.*\(1\)/m.test(textoPlano);

      if (formatoEspecial) {
        const lineas = textoPlano.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        const matriz = lineas.map((linea) => {
          const fechaMatch = linea.match(/^\d{1,2}\/\d{1,2}\/\d{4}/);
          if (!fechaMatch) return [];
          const fecha = fechaMatch[0];
          const horasStr = linea.slice(fecha.length).trim();
          const horas = horasStr.split(",").map((h) => {
            const match = h.match(/\d{2}:\d{2}/);
            return match ? match[0] : null;
          }).filter((h) => h !== null);
          return [fecha, ...horas];
        }).filter((row) => row.length > 0);
        return { tipo: "especial", matriz };
      }

      fullText.pages.forEach((page) => {
        page.blocks.forEach((block) => {
          block.paragraphs.forEach((paragraph) => {
            paragraph.words.forEach((word) => {
              const texto = word.symbols.map((s) => s.text).join("");
              const box = word.boundingBox.vertices;
              const centroX = box.reduce((sum, v) => sum + v.x, 0) / 4;
              const centroY = box.reduce((sum, v) => sum + v.y, 0) / 4;
              palabras.push({ texto, centroX, centroY });
            });
          });
        });
      });
      return { tipo: "normal", palabras };
    };

    if (imagePath) {
      const resultado = await procesarArchivo(imagePath);
      if (resultado.tipo === "normal" && resultado.palabras.length > 0) {
        const toleranciaY = 15;
        const filas = [];
        for (const palabra of resultado.palabras) {
          let encontrada = false;
          for (const fila of filas) {
            if (Math.abs(fila.y - palabra.centroY) < toleranciaY) {
              fila.items.push(palabra);
              encontrada = true;
              break;
            }
          }
          if (!encontrada) filas.push({ y: palabra.centroY, items: [palabra] });
        }
        filas.sort((a, b) => a.y - b.y);

        const columnas = [];
        const toleranciaX = 50;
        const centrosGlobalX = resultado.palabras.map((p) => p.centroX).sort((a, b) => a - b);
        for (const x of centrosGlobalX) {
          const colCercana = columnas.find((c) => Math.abs(c - x) < toleranciaX);
          if (!colCercana) columnas.push(x);
        }
        columnas.sort((a, b) => a - b);

        const matrizOCR = filas.map((fila) => {
          const celdas = Array(columnas.length).fill("");
          for (const palabra of fila.items) {
            let minDist = Infinity;
            let colIndex = 0;
            columnas.forEach((colX, idx) => {
              const dist = Math.abs(palabra.centroX - colX);
              if (dist < minDist) {
                minDist = dist;
                colIndex = idx;
              }
            });
            celdas[colIndex] += (celdas[colIndex] ? " " : "") + palabra.texto;
          }
          return celdas;
        });

        const cleanedMatriz = matrizOCR.map((row) =>
          row.map((cell) => cell.trim().replace(/\s+/g, " "))
        );

        const header = cleanedMatriz[0].map((col) => col.toLowerCase());
        const lnIndex = header.indexOf("ln");
        const timeIndex = header.indexOf("time");
        const daysIndex = header.indexOf("days");
        const lenIndex = header.indexOf("len");
        const rateIndex = header.indexOf("rate");
        const noteIndex = header.indexOf("note");

        if (lnIndex === -1 || timeIndex === -1 || daysIndex === -1 || lenIndex === -1 || rateIndex === -1) {
          throw new Error("No se encontraron todas las columnas esperadas en la tabla de la imagen.");
        }

        tableRows = cleanedMatriz.slice(1).map((row, index) => {
          const lnValue = row[lnIndex] && /^\d+$/.test(row[lnIndex]) ? row[lnIndex] : (index + 1).toString();
          return {
            Ln: lnValue,
            Time: row[timeIndex] || "",
            Days: row[daysIndex] ? row[daysIndex].replace(/\s+/g, "") : "",
            Len: row[lenIndex] || "",
            Rate: row[rateIndex] || "",
            Note: noteIndex !== -1 ? row[noteIndex] || "" : "",
          };
        }).filter((row) => row.Time || row.Days);

      }
    }

    for (const pdfImg of pdfImagePaths) {
      const resultado = await procesarArchivo(pdfImg);
      if (resultado.tipo === "especial") {
        for (const block of resultado.matriz) {
          const date = block[0];
          for (const time of block.slice(1)) {
            allDateTimes.push([date, time]);
          }
        }
      }
    }

    if (tableRows.length === 0 || allDateTimes.length === 0) {
      throw new Error("No se detectaron datos suficientes en la imagen o los PDFs.");
    }

    const parseTime = (timeStr) => {
      const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?([ap])/i);
      if (!match) return null;
      let hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      const meridiem = match[3].toLowerCase();
      if (meridiem === "p" && hour !== 12) hour += 12;
      else if (meridiem === "a" && hour === 12) hour = 0;
      return hour * 60 + minute;
    };

    const formatTime = (timeStr) => {
      const [h, m] = timeStr.split(":").map(Number);
      const timeDate = new Date(1970, 0, 1, h, m, 0);
      return timeDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    };

    const findMatchingRow = (date, time) => {
      const timeMatch = time.match(/\d{2}:\d{2}/);
      if (!timeMatch) {
        console.error(`Formato de hora inválido: ${time}`);
        return null;
      }

      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        console.error(`Fecha inválida: ${date}`);
        return null;
      }

      const dayIndex = dateObj.getDay();
      const dayAbbr = ["Su", "M", "Tu", "W", "Th", "F", "Sa"][dayIndex];
      const [h, m] = timeMatch[0].split(":").map(Number);
      const minutes = h * 60 + m;

      for (const row of tableRows) {
        const [startStr, endStr] = row.Time.split(" - ");
        const start = parseTime(startStr);
        const end = parseTime(endStr);
        if (start === null || end === null) continue;

        const isInTimeRange = end === 0 ? minutes >= start : start <= minutes && minutes < end;
        if (isInTimeRange && row.Days.includes(dayAbbr)) {
          return row;
        }
      }
      console.log(`No se encontró coincidencia para ${date} ${time}`);
      return null;
    };

    const dayNamesEs = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    let isciCounter = 1;
    const outputRows = [];

    for (const [date, time] of allDateTimes) {
      const matchingRow = findMatchingRow(date, time);
      if (matchingRow) {
        const dateObj = new Date(date);
        const day = dayNamesEs[dateObj.getDay()];
        const timeStr = formatTime(time);
        const rate = matchingRow.Rate.replace("$", "").trim() + "$";
        const isci = `WebsterBank_WebstersWithYou_3OR_ESP_v${isciCounter.toString().padStart(2, "0")}`;
        outputRows.push([day, date, timeStr, matchingRow.Ln, matchingRow.Len, "WebsterBank", isci, rate]);
        isciCounter++;
      }
    }

    const headerRow = [...Array(20).fill(""), "DAY", "DATE", "TIME", "LN", "LENGTH", "PRODUCT", "ISCI", "RATE"];
    const dataRows = outputRows.map((row) => [...Array(20).fill(""), ...row]);
    const wsData = [headerRow, ...dataRows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    console.log("data",ws);

    XLSX.utils.book_append_sheet(wb, ws, "Contenido");
    XLSX.writeFile(wb, excelPath);
  }
}
*/
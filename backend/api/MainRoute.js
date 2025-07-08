import { fileURLToPath } from "url";
import path from "path";
import multer from "multer";
import fs from "fs";
import MainController from "./MainController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "..", "imagenes"));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });
const controller = new MainController();

export default class MainRoute {
  static configRoutes(router) {
    router.post(
      "/convert-to-excel",
      upload.fields([
        { name: "imagen", maxCount: 1 },
        { name: "imagenesPDF", maxCount: 10 },
      ]),
      async (req, res) => {
        try {
          const files = req.files || {};
          const imagenPath = files.imagen ? files.imagen[0].path : null;
          const imagenesPDFPaths = files.imagenesPDF?.map((file) => file.path) || [];
          if (!imagenPath && imagenesPDFPaths.length === 0) {
            return res.status(400).json({ error: "No se subió ninguna imagen." });
          }
          const excelPath = path.join(__dirname, "..", "imagenes", `resultado-${Date.now()}.xlsx`);
          await controller.extractTextAndSaveToExcel(imagenPath, imagenesPDFPaths, excelPath);
          res.download(excelPath, "resultado.xlsx", (err) => {
            if (err) console.error("❌ Error al enviar archivo:", err);
            if (imagenPath) fs.unlink(imagenPath, () => {});
            imagenesPDFPaths.forEach((path) => fs.unlink(path, () => {}));
            fs.unlink(excelPath, () => {});
          });
        } catch (error) {
          console.error("❌ Error en OCR:", error);
          res.status(500).json({ error: error.message });
        }
      }
    );
    return router;
  }
}







/*
import { fileURLToPath } from 'url';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import MainController from './MainController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'imagenes'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });
const controller = new MainController();

export default class MainRoute {
  static configRoutes(router) {
    router.post('/convert-to-excel', upload.fields([
      { name: 'imagen', maxCount: 1 },
      { name: 'imagenesPDF', maxCount: 10 }
    ]), async (req, res) => {
      try {
        const files = req.files || {};
        const imagenPath = files.imagen ? files.imagen[0].path : null;
        const imagenesPDFPaths = files.imagenesPDF?.map(file => file.path) || [];

        if (!imagenPath && imagenesPDFPaths.length === 0) {
          return res.status(400).json({ error: 'No se subió ninguna imagen.' });
        }

        const excelPath = path.join(__dirname, '..', 'imagenes', `resultado-${Date.now()}.xlsx`);

        await controller.extractTextAndSaveToExcel(imagenPath, imagenesPDFPaths, excelPath);

        res.download(excelPath, 'resultado.xlsx', (err) => {
          if (err) console.error("❌ Error al enviar archivo:", err);

          // Limpiar archivos
          if (imagenPath) fs.unlink(imagenPath, () => {});
          imagenesPDFPaths.forEach(path => fs.unlink(path, () => {}));
          fs.unlink(excelPath, () => {});
        });
      } catch (error) {
        console.error("❌ Error en OCR:", error);
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }
}

*/
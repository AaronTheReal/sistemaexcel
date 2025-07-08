// Importa el cliente de Google Cloud Vision
import vision from '@google-cloud/vision'

// Ruta al archivo .json de la cuenta de servicio
process.env.GOOGLE_APPLICATION_CREDENTIALS = './realmediagroup-ba80ccac0989.json'

const client = new vision.ImageAnnotatorClient()

async function detectarEstructuraTexto(rutaImagen) {
  const [result] = await client.documentTextDetection(rutaImagen)
  const fullText = result.fullTextAnnotation

  if (!fullText) {
    console.log('❌ No se detectó texto.')
    return
  }

  console.log('✅ Texto detectado:\n')

  const palabras = []

  fullText.pages.forEach((page, pageIndex) => {
    page.blocks.forEach((block, blockIndex) => {
      block.paragraphs.forEach((paragraph, paragraphIndex) => {
        paragraph.words.forEach((word) => {
          const texto = word.symbols.map(s => s.text).join('')
          const box = word.boundingBox.vertices
          const centroX = box.reduce((sum, v) => sum + v.x, 0) / 4
          const centroY = box.reduce((sum, v) => sum + v.y, 0) / 4

          palabras.push({
            texto,
            centroX,
            centroY,
            box
          })
        })
      })
    })
  })

  // Ordenar por Y para filas, y luego por X para columnas (umbral de tolerancia)
  palabras.sort((a, b) => {
    const tolerancia = 10
    if (Math.abs(a.centroY - b.centroY) < tolerancia) {
      return a.centroX - b.centroX
    }
    return a.centroY - b.centroY
  })

  palabras.forEach(p => {
    console.log(`${p.texto}\t(${Math.round(p.centroX)}, ${Math.round(p.centroY)})`)
  })

  // Aquí ya tienes cada palabra con coordenadas: puedes reconstruir visualmente
  // una tabla bidimensional con filas y columnas agrupadas
}

detectarEstructuraTexto('./imagenes/imagen1.png')



/*
// Importa el cliente de Google Cloud Vision
import vision from '@google-cloud/vision'

// Ruta al archivo .json de la cuenta de servicio
process.env.GOOGLE_APPLICATION_CREDENTIALS = './realmediagroup-ba80ccac0989.json'; // 🔁 Cámbiala por la ruta real

// Crea cliente
const client = new vision.ImageAnnotatorClient();

async function detectarTexto(rutaImagen) {
  const [result] = await client.textDetection(rutaImagen);
  const detections = result.textAnnotations;
  
  if (!detections.length) {
    console.log('❌ No se detectó texto.');
    return;
  }

  console.log('✅ Texto detectado:\n');
  console.log(detections[0].description); // Texto completo
}

detectarTexto('./imagenes/imagen1.png'); // 🔁 Cambia por el path real de la imagen

*/
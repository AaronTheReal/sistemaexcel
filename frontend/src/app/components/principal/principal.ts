import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConvertirService } from '../../../services/convertir-service';

@Component({
  selector: 'app-principal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './principal.html',
  styleUrls: ['./principal.css']
})
export class Principal {
  imagen: File | null = null;
  imagenesAdicionales: File[] = [];
  preview: string | null = null;
  adicionalesCargadas: number = 0;

  constructor(private convertirService: ConvertirService) {}

  // Imagen principal (única)
  onImagenChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.imagen = file;
      this.preview = URL.createObjectURL(file);
    }
  }

  // Múltiples imágenes que simulan un PDF dividido en capturas
  onImagenesAdicionalesChange(event: any) {
    const files: File[] = Array.from(event.target.files as FileList);
    if (files.length > 0) {
      this.imagenesAdicionales = files;
      this.adicionalesCargadas = files.length;
    }
  }

  // Enviar al backend
  enviar() {
    if (!this.imagen && this.imagenesAdicionales.length === 0) {
      return alert('Selecciona al menos una imagen principal o imágenes adicionales');
    }

    this.convertirService.enviarArchivos(this.imagen, this.imagenesAdicionales).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resultado.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => alert('❌ Error al convertir los archivos')
    });
  }
}

// convertir-service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConvertirService {
  private baseUrl = 'https://sistemaexcel.onrender.com/aaron/maslatino/convert-to-excel';
  //http://localhost:4000/aaron/maslatino/convert-to-excel
  constructor(private http: HttpClient) {}

    enviarArchivos(imagen: File | null, imagenesAdicionales: File[]): Observable<Blob> {
      const formData = new FormData();

      if (imagen) formData.append('imagen', imagen);
      imagenesAdicionales.forEach(file => {
        formData.append('imagenesPDF', file); // nombre debe coincidir con el del backend
      });

      return this.http.post(this.baseUrl, formData, {
        responseType: 'blob'
      });
    }


}

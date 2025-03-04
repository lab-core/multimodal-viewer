import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private apiUrl = 'http://127.0.0.1:5000/api/';

  constructor(private http: HttpClient) {}

  exportInputData(folderName: string): Observable<Blob> {
    return this.http.get(this.apiUrl + `input_data/${folderName}`, { responseType: 'blob' });
  }

  importInputData(folderName: string, formData: FormData): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.apiUrl + `input_data/${folderName}`, formData);
  }
  
}

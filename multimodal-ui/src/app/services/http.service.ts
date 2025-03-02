import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private apiUrl = 'http://127.0.0.1:5000/api/';

  constructor(private http: HttpClient) {}

  confirmConnection(): void {
    this.http.get<void>(this.apiUrl + 'confirm_connection');
  }

  getData(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }

  exportInputData(folderName: string): Observable<Blob> {
    return this.http.get(this.apiUrl + `input_data/${folderName}`, { responseType: 'blob' });
  }
  
}

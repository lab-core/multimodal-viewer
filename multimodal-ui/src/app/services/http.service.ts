import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private apiUrl = 'http://127.0.0.1:8089/api/';

  constructor(private http: HttpClient) {}

  exportFolder(folderContent: string, folderName: string): Observable<Blob> {
    return this.http.get(this.apiUrl + `${folderContent}/${folderName}`, { responseType: 'blob' });
  }

  importFolder(folderContent: string, folderName: string, formData: FormData): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.apiUrl + `${folderContent}/${folderName}`, formData);
  }

  deleteFolder(folderContent: string, folderName: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.apiUrl + `${folderContent}/${folderName}`);
  }
  
}

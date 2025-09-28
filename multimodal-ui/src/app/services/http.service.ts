import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ImportFolderContent = 'instance' | 'instances' | 'simulation';

export interface ImportFolderResponse {
  message: string;
  folderName: string;
}

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  exportFolder(folderContent: string, folderName: string): Observable<Blob> {
    return this.http.get(this.apiUrl + `${folderContent}/${folderName}`, {
      responseType: 'blob',
    });
  }

  importFolder(
    folderContent: ImportFolderContent,
    folderName: string,
    formData: FormData,
  ): Observable<ImportFolderResponse> {
    return this.http.post<{ message: string; folderName: string }>(
      this.apiUrl + `${folderContent}/${folderName}`,
      formData,
    );
  }

  deleteFolder(
    folderContent: string,
    folderName: string,
  ): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      this.apiUrl + `${folderContent}/${folderName}`,
    );
  }
}

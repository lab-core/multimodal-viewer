import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  LoadingDialogComponent,
  LoadingDialogData,
  LoadingDialogResult,
} from '../components/loading-dialog/loading-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private loadingDialogRef: MatDialogRef<
    LoadingDialogComponent,
    LoadingDialogResult
  > | null = null;

  constructor(private readonly matDialog: MatDialog) {}

  start(message: string | null): void {
    this.loadingDialogRef = this.matDialog.open<
      LoadingDialogComponent,
      LoadingDialogData,
      LoadingDialogResult
    >(LoadingDialogComponent, {
      data: {
        message,
      },
      disableClose: true,
      autoFocus: false,
      maxHeight: '80vh',
      maxWidth: '80vw',
      width: '200px',
    });
  }

  stop(): void {
    if (this.loadingDialogRef) {
      this.loadingDialogRef.close();
      this.loadingDialogRef = null;
    }
  }
}

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogContent } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface LoadingDialogData {
  message: string | null;
}

export type LoadingDialogResult = null;

@Component({
  selector: 'app-loading-dialog',
  imports: [MatDialogContent, MatProgressSpinnerModule],
  templateUrl: './loading-dialog.component.html',
  styleUrl: './loading-dialog.component.css',
})
export class LoadingDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: LoadingDialogData) {}
}

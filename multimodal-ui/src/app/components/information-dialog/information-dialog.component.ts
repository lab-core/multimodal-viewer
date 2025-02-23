import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';

export interface InformationDialogData {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info' | null;
  confirmButtonOverride: string | null;
  cancelButtonOverride: string | null;
  canCancel: boolean;
}

export type InformationDialogResult = boolean | null;

@Component({
  selector: 'app-information-dialog',
  imports: [
    MatDialogClose,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatButtonModule,
    MatIcon,
  ],
  templateUrl: './information-dialog.component.html',
  styleUrl: './information-dialog.component.css',
})
export class InformationDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: InformationDialogData) {}
}

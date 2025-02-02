import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type DisconnectedDialogData = null;

export type DisconnectedDialogResult = null;

@Component({
  selector: 'app-disconnected-dialog',
  imports: [
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
    MatDialogClose,
    MatDialogActions,
    MatButton,
  ],
  templateUrl: './disconnected-dialog.component.html',
  styleUrl: './disconnected-dialog.component.css',
})
export class DisconnectedDialogComponent {}

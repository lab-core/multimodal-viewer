import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarAction,
  MatSnackBarActions,
  MatSnackBarLabel,
  MatSnackBarRef,
} from '@angular/material/snack-bar';

export interface SnackBarData {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

@Component({
  selector: 'app-snack-bar',
  imports: [
    MatSnackBarLabel,
    MatSnackBarAction,
    MatSnackBarActions,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './snack-bar.component.html',
  styleUrl: './snack-bar.component.scss',
})
export class SnackBarComponent {
  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: SnackBarData,
    private readonly snackBarRef: MatSnackBarRef<SnackBarComponent>,
  ) {}

  dismiss() {
    this.snackBarRef.dismiss();
  }
}

import { Component, inject } from '@angular/core';
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
  data = inject<SnackBarData>(MAT_SNACK_BAR_DATA);
  private readonly snackBarRef =
    inject<MatSnackBarRef<SnackBarComponent>>(MatSnackBarRef);

  dismiss() {
    this.snackBarRef.dismiss();
  }
}

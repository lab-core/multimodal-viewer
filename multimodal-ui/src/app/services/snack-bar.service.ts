import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  SnackBarComponent,
  SnackBarData,
} from '../components/snack-bar/snack-bar.component';

@Injectable({
  providedIn: 'root',
})
export class SnackBarService {
  constructor(private readonly snackBar: MatSnackBar) {}

  showMessage(message: string, type: 'success' | 'error' | 'info' | 'warning') {
    this.snackBar.openFromComponent<SnackBarComponent, SnackBarData>(
      SnackBarComponent,
      {
        data: {
          message,
          type,
        },
        duration: 3000,
        panelClass: [type],
      },
    );
  }
}

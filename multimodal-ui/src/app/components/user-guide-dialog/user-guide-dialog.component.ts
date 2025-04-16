import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-user-guide-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './user-guide-dialog.component.html',
  styleUrl: './user-guide-dialog.component.css',
})
export class UserGuideComponent {}

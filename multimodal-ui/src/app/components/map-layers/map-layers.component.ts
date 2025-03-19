import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-map-layers',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatExpansionModule,
  ],
  templateUrl: './map-layers.component.html',
  styleUrl: './map-layers.component.css',
})
export class MapLayersComponent {
  showText = false;
  onOpened() {
    this.showText = true;
  }

  onClosed() {
    this.showText = false;
  }
}

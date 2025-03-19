import { Component, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MapService } from '../../services/map.service';
import { MapLayer } from '../../interfaces/map.model';

@Component({
  selector: 'app-map-layers',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatExpansionModule,
    MatChipsModule,
  ],
  templateUrl: './map-layers.component.html',
  styleUrl: './map-layers.component.css',
})
export class MapLayersComponent {
  mapLayers: Signal<MapLayer[]>;
  selectedIndex: Signal<number>;

  constructor(readonly mapService: MapService) {
    this.mapLayers = mapService.mapLayers;
    this.selectedIndex = mapService.selectedIndex;
  }

  setMapTile(index: number) {
    this.mapService.setTileLayer(index);
  }
}

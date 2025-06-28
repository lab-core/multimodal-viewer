import { Component, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { MapTile } from '../../interfaces/map.model';
import { DialogService } from '../../services/dialog.service';
import { MapService } from '../../services/map.service';

@Component({
  selector: 'app-map-tiles',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatExpansionModule,
    MatChipsModule,
  ],
  templateUrl: './map-tiles.component.html',
  styleUrl: './map-tiles.component.css',
})
export class MapLayersComponent {
  mapTiles: Signal<MapTile[]>;
  selectedMapTile: Signal<MapTile | null>;

  constructor(
    readonly mapService: MapService,
    readonly dialogService: DialogService,
  ) {
    this.mapTiles = mapService.mapTiles;
    this.selectedMapTile = mapService.selectedMapTile;
  }

  setMapTile(tile: MapTile) {
    this.mapService.selectMapTile(tile);
  }

  removeMapTile(tile: MapTile) {
    this.mapService.removeMapTile(tile);
  }

  async addMapTile() {
    const result = await firstValueFrom(
      this.dialogService.openAddMapTileDialog().afterClosed(),
    );

    if (!result) {
      return;
    }

    this.mapService.addMapTile(result.name, result.url, result.attribution);
  }

  async editMapIcons() {
    await firstValueFrom(
      this.dialogService.openEditMapIconsDialog().afterClosed(),
    );
  }
}

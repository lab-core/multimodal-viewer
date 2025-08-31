import { Component, OnDestroy } from '@angular/core';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { latLng, Map } from 'leaflet';
import {
  MAP_CENTER_LOCAL_STORAGE_KEY,
  MAP_ZOOM_LOCAL_STORAGE_KEY,
} from '../../interfaces/local-storage';
import { AnimationService } from '../../services/animation.service';
import { MapService } from '../../services/map.service';
import { CloseEntitiesMenuComponent } from '../close-entities-menu/close-entities-menu.component';

@Component({
  selector: 'app-map',
  imports: [LeafletModule, CloseEntitiesMenuComponent],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css',
})
export class MapComponent implements OnDestroy {
  private map: Map | null = null;

  constructor(
    private readonly mapService: MapService,
    private readonly animationService: AnimationService,
  ) {
    window.addEventListener('beforeunload', this.saveMapState.bind(this));
  }

  ngOnDestroy() {
    window.removeEventListener('beforeunload', this.saveMapState.bind(this));
    this.saveMapState();
  }

  onMapReady(map: Map) {
    this.map = map;
    this.mapService.map = map;
    this.mapService.selectMapTile(this.mapService.selectedMapTileSignal());

    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');

    this.animationService.addPixiOverlay(map);

    const savedCenter = localStorage.getItem(MAP_CENTER_LOCAL_STORAGE_KEY);
    const center = savedCenter
      ? (JSON.parse(savedCenter) as [number, number])
      : latLng(45.523066, -73.652687); // Montreal as Default

    const savedZoom = localStorage.getItem(MAP_ZOOM_LOCAL_STORAGE_KEY);
    const zoom = savedZoom ? parseInt(savedZoom, 10) : 12;

    map.setView(center, zoom);
  }

  private saveMapState() {
    if (!this.map) {
      return;
    }

    const currentZoom = this.map.getZoom();
    const currentCenter = this.map.getCenter();

    localStorage.setItem(MAP_ZOOM_LOCAL_STORAGE_KEY, currentZoom.toString());
    localStorage.setItem(
      MAP_CENTER_LOCAL_STORAGE_KEY,
      JSON.stringify([currentCenter.lat, currentCenter.lng]),
    );
  }
}

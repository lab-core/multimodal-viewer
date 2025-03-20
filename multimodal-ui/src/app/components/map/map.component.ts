import { Component, inject, OnDestroy } from '@angular/core';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { latLng, Map, tileLayer } from 'leaflet';
import { AnimationService } from '../../services/animation.service';
import { MapService } from '../../services/map.service';

@Component({
  selector: 'app-map',
  imports: [LeafletModule],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css',
})
export class MapComponent implements OnDestroy {
  animationService: AnimationService = inject(AnimationService);
  savedZoom = localStorage.getItem('mapZoom') ? parseInt(localStorage.getItem('mapZoom')!, 10) : 12;

  options = {
    layers: [
      tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        noWrap: true,
        minZoom: 3,
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
    ],

    zoom: this.savedZoom,
    center: latLng(45.523066, -73.652687),
  };

  private map!: Map;

  constructor(private readonly mapService: MapService) {
    window.addEventListener('beforeunload', this.saveZoomBeforeUnload.bind(this));
  }

  ngOnDestroy() {
    window.removeEventListener('beforeunload', this.saveZoomBeforeUnload.bind(this));
  }

  onMapReady(map: Map) {
    this.map = map;
    this.mapService.map = map;
    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');
    this.animationService.addPixiOverlay(map);

    if (this.savedZoom) {
      map.setZoom(this.savedZoom);
    }
  }

  private saveZoomBeforeUnload() {
    if (this.map) {
      const currentZoom = this.map.getZoom();
      localStorage.setItem('mapZoom', currentZoom.toString());
    }
  }
}
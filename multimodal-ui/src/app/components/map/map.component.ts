import { Component, inject } from '@angular/core';

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
export class MapComponent {
  animationService: AnimationService = inject(AnimationService);

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

    // Montreal
    zoom: 12,
    center: latLng(45.523066, -73.652687),
  };

  constructor(private readonly mapService: MapService) {}

  onMapReady(map: Map) {
    this.mapService.map = map;
    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');
    this.animationService.addPixiOverlay(map);
  }
}

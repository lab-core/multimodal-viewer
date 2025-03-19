import { Component, inject } from '@angular/core';

import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { latLng, Map, TileLayer, tileLayer } from 'leaflet';
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
    layers: [],

    // Montreal
    zoom: 12,
    center: latLng(45.523066, -73.652687),
  };

  constructor(private readonly mapService: MapService) {
    // const mapLayer = mapService.mapLayers()[0];
    // const tile = tileLayer(mapLayer.url, {
    //   noWrap: true,
    //   minZoom: 3,
    //   maxZoom: 18,
    //   attribution: mapLayer.attribution,
    // });
  }

  onMapReady(map: Map) {
    this.mapService.map = map;
    this.mapService.setTileLayer(0);

    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');
    this.animationService.addPixiOverlay(map);
  }
}

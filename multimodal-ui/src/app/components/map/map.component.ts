import { Component, inject, OnDestroy } from '@angular/core';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { latLng, Map, LatLngExpression } from 'leaflet';
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

  // Retrieve saved zoom and position from localStorage
  savedZoom = localStorage.getItem('mapZoom')
    ? parseInt(localStorage.getItem('mapZoom')!, 10)
    : 12;
  savedCenter: LatLngExpression = localStorage.getItem('mapCenter')
    ? (JSON.parse(localStorage.getItem('mapCenter')!) as [number, number])
    : latLng(45.523066, -73.652687); // Montreal as Default

  options = {
    layers: [],

    zoom: this.savedZoom,
    center: this.savedCenter,
  };

  private map!: Map;

  constructor(private readonly mapService: MapService) {
    window.addEventListener('beforeunload', this.saveMapState.bind(this));
  }

  ngOnDestroy() {
    window.removeEventListener('beforeunload', this.saveMapState.bind(this));
    this.saveMapState();
  }

  onMapReady(map: Map) {
    this.map = map;
    this.mapService.map = map;
    this.mapService.selectMapTile(this.mapService.selectedMapTile());

    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');
    this.animationService.addPixiOverlay(map);

    if (this.savedZoom) {
      map.setZoom(this.savedZoom);
    }
    if (this.savedCenter) {
      map.setView(this.savedCenter, this.savedZoom);
    }
  }

  private saveMapState() {
    if (this.map) {
      const currentZoom = this.map.getZoom();
      const currentCenter = this.map.getCenter();

      localStorage.setItem('mapZoom', currentZoom.toString());
      localStorage.setItem(
        'mapCenter',
        JSON.stringify([currentCenter.lat, currentCenter.lng]),
      );
    }
  }
}

import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {MatIconModule} from '@angular/material/icon';
import {MatDividerModule} from '@angular/material/divider';
import {MatButtonModule} from '@angular/material/button';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { MapService } from './services/map.service';
import { latLng, tileLayer, Map } from 'leaflet';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LeafletModule, MatButtonModule, MatDividerModule, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  mapService: MapService = inject(MapService);

  title = 'multimodal-ui';

  options = {
    layers: [
      tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
    ],

    // Montreal
    zoom: 12,
    center: latLng(45.523066, -73.652687)
  };

  onMapReady(map: Map) {
    this.mapService.map = map;
  }

  printLongLatZoom() {
    console.log(this.mapService.map?.getCenter())
    console.log(this.mapService.map?.getZoom());
  }
}

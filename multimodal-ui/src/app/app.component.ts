// @ts-nocheck
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { MapService } from './services/map.service';

import * as PIXI from 'pixi.js';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import { CommunicationService } from './services/communication.service';
import { AnimationService } from './services/animation.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    LeafletModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatCardModule
  ],
  providers: [CommunicationService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  mapService: MapService = inject(MapService);
  animationService: AnimationService = inject(AnimationService);

  title = 'Multimodal';

  options = {
    layers: [
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
    ],

    // Montreal
    zoom: 12,
    center: L.latLng(45.523066, -73.652687),
  };

  constructor(private readonly communicationService: CommunicationService) {
    this.communicationService.on('simulationStarted', (name) => {
      console.log(`Simulation started: ${name}`);
    });

    this.communicationService.on('simulationEnded', (name) => {
      console.log(`Simulation ended: ${name}`);
    });

    this.communicationService.on('simulationAlreadyRunning', (name) => {
      console.log(`Simulation already running: ${name}`);
    });

    this.communicationService.on('simulationNotRunning', (name) => {
      console.log(`Simulation not running: ${name}`);
    });
  }

  startSimulation() {
    this.communicationService.emit('startSimulation', 'test');
  }

  stopSimulation() {
    this.communicationService.emit('stopSimulation', 'test');
  }

  onMapReady(map: Map) {
    this.mapService.map = map;
    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');
    this.animationService.addPixiOverlay(map);
  }

  printLongLatZoom() {
    console.log(this.mapService.map?.getCenter());
    console.log(this.mapService.map?.getZoom());
  }
}

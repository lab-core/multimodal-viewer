import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

// import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import { MapComponent } from './components/map/map.component';
import { CommunicationService } from './services/communication.service';

@Component({
  selector: 'app-root',
  imports: [MapComponent, MatButtonModule, MatDividerModule, MatIconModule],
  providers: [CommunicationService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
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
}

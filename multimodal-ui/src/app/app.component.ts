import { Component } from '@angular/core';

// import * as L from 'leaflet';
import { RouterOutlet } from '@angular/router';
import 'leaflet-pixi-overlay';
import { ConnectionStatusComponent } from './components/connection-status/connection-status.component';
import { MapComponent } from './components/map/map.component';
import { DataService } from './services/data.service';

@Component({
  selector: 'app-root',
  imports: [MapComponent, RouterOutlet, ConnectionStatusComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  // Declare the service to ensure it is created
  constructor(private readonly dataService: DataService) {}
}

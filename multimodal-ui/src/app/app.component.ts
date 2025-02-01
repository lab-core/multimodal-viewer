import { Component } from '@angular/core';

// import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import { MapComponent } from './components/map/map.component';
import { UserInterfaceComponent } from './components/user-interface/user-interface.component';
import { CommunicationService } from './services/communication.service';

@Component({
  selector: 'app-root',
  imports: [MapComponent, UserInterfaceComponent],
  providers: [CommunicationService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}

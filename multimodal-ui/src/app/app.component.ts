import { Component, OnInit } from '@angular/core';
import { HttpService } from './services/http.service';

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
export class AppComponent implements OnInit {
  // Declare the service to ensure it is created
  message = '';

  constructor(private readonly dataService: DataService, private httpService: HttpService) {}

  ngOnInit() {
    this.httpService.getData().subscribe((data: any) => {
      this.message = data.message;
    });
  }
}



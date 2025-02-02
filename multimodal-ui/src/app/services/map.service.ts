import { Injectable } from '@angular/core';
import { Map } from 'leaflet';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  map: Map | null = null;
}

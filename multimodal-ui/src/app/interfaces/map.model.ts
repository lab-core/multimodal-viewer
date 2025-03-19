import { TileLayer } from 'leaflet';

export interface MapLayer {
  name: string;
  tile: TileLayer;
}

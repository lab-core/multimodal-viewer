import { TileLayer } from 'leaflet';

export interface MapTileSaveData {
  name: string;
  url: string;
  attribution: string | null;
  custom: boolean;
}

export interface MapTile extends MapTileSaveData {
  tile: TileLayer;
}

import { TileLayer } from 'leaflet';

export interface MapTile {
  name: string;
  url: string;
  attribution: string | null;
  tile: TileLayer;
  custom: boolean;
}

export interface MapTileSaveData {
  name: string;
  url: string;
  attribution: string | null;
  custom: boolean;
}

import { TileLayer } from 'leaflet';

export interface MapTileSaveData {
  name: string;
  url: string;
  attribution: string | null;
}

export interface MapTile extends MapTileSaveData {
  tile: TileLayer;
  isDefault: boolean;
}

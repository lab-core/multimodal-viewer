import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { Map, tileLayer } from 'leaflet';
import { MapLayer as MapTileData } from '../interfaces/map.model';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private readonly noWrap = true;
  private readonly minZoom = 8;
  private readonly maxZoom = 18;

  map: Map | null = null;

  private _lastTile: MapTileData | null = null;

  private _selectedIndex: WritableSignal<number> = signal(0);
  get selectedIndex(): Signal<number> {
    return this._selectedIndex;
  }

  private _mapTiles: WritableSignal<MapTileData[]> = signal([]);
  get mapTiles(): Signal<MapTileData[]> {
    return this._mapTiles;
  }

  constructor() {
    // Sample map tile providers

    this.addMapTile(
      'OSM',
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    );

    this.addMapTile(
      'Stamen Toner Lite (free tier)',
      'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png',
      '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a hr&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a> contributorsef="https://stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a> contributors',
    );
  }

  addMapTile(name: string, url: string, attribution: string | null) {
    this._mapTiles.update((mapTiles) => {
      mapTiles.push(this.createTileLayer(name, url, attribution));
      return mapTiles;
    });
  }

  setMapTile(index: number) {
    if (this.map == null) return;

    if (this._lastTile != null) {
      this.map.removeLayer(this._lastTile.tile);
    }

    this._selectedIndex.set(index);

    const mapLayer = this._mapTiles()[index];
    this._lastTile = mapLayer;

    mapLayer.tile.addTo(this.map);
  }

  private createTileLayer(
    name: string,
    url: string,
    attribution: string | null,
  ): MapTileData {
    return {
      name,
      tile: tileLayer(url, {
        noWrap: this.noWrap,
        minZoom: this.minZoom,
        maxZoom: this.maxZoom,
        attribution: attribution ?? undefined,
      }),
    };
  }
}

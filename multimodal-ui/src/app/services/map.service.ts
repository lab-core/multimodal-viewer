import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { Map, tileLayer } from 'leaflet';
import { MapLayer } from '../interfaces/map.model';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private readonly noWrap = true;
  private readonly minZoom = 8;
  private readonly maxZoom = 18;

  map: Map | null = null;

  private _lastTile: MapLayer | null = null;

  private _selectedIndex: WritableSignal<number> = signal(0);
  get selectedIndex(): Signal<number> {
    return this._selectedIndex;
  }

  private _mapLayers: WritableSignal<MapLayer[]> = signal([]);
  get mapLayers(): Signal<MapLayer[]> {
    return this._mapLayers;
  }

  constructor() {
    this._mapLayers.update((mapLayers) => {
      mapLayers.push({
        name: 'OpenSteetMaps',
        tile: tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          noWrap: this.noWrap,
          minZoom: this.minZoom,
          maxZoom: this.maxZoom,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }),
      });

      mapLayers.push({
        name: 'Stamen Toner Lite (free tier)',
        tile: tileLayer(
          'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png',
          {
            noWrap: this.noWrap,
            minZoom: this.minZoom,
            maxZoom: this.maxZoom,
            attribution:
              '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a hr&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a> contributorsef="https://stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a> contributors',
          },
        ),
      });
      return mapLayers;
    });
  }

  setTileLayer(index: number) {
    if (this.map == null) return;

    if (this._lastTile != null) {
      this.map.removeLayer(this._lastTile.tile);
    }

    this._selectedIndex.set(index);

    const mapLayer = this._mapLayers()[index];
    this._lastTile = mapLayer;

    mapLayer.tile.addTo(this.map);
  }
}

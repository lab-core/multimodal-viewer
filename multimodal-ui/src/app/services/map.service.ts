import {
  effect,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { Map, TileLayer, tileLayer } from 'leaflet';
import { MapTile, MapTileSaveData } from '../interfaces/map.model';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private readonly ADDED_TILES_LOCAL_STORAGE_KEY: string =
    'multimodal.added-tiles';
  private readonly SELECTED_TILE_INDEX_LOCAL_STORAGE_KEY: string =
    'multimodal.selected-tile-index';

  private readonly NO_WRAP = true;
  private readonly MINIMUM_ZOOM = 8;
  private readonly MAXIMUM_ZOOM = 18;

  private _map: Map | null = null;

  private _selectedMapTileSignal: WritableSignal<MapTile | null> = signal(null);
  private _mapTilesSignal: WritableSignal<MapTile[]> = signal([]);

  set map(map: Map) {
    this._map = map;
  }

  get selectedMapTileSignal(): Signal<MapTile | null> {
    return this._selectedMapTileSignal;
  }

  get mapTilesSignal(): Signal<MapTile[]> {
    return this._mapTilesSignal;
  }

  constructor() {
    this.loadMapTilesData();

    effect(() => {
      this.saveMapTilesEffect();
    });

    effect(() => {
      this.setIndexEffect();
    });
  }

  selectMapTile(mapTile: MapTile | null) {
    if (this._map == null || mapTile === null) return;

    const selectedMapTile = this._selectedMapTileSignal();
    if (selectedMapTile !== null && selectedMapTile !== mapTile) {
      this._map.removeLayer(selectedMapTile.tile);
    }

    this._selectedMapTileSignal.set(mapTile);
    mapTile.tile.addTo(this._map);
  }

  addMapTile(name: string, url: string, attribution: string | null) {
    this._mapTilesSignal.update((mapTiles) => {
      const newTile = this.createMapTile(name, url, attribution, false);
      return [...mapTiles, newTile];
    });
  }

  removeMapTile(tile: MapTile) {
    this._mapTilesSignal.update((mapTiles) => {
      return mapTiles.filter((mapTile) => mapTile !== tile);
    });
  }

  private getDefaultMapTiles() {
    const defaultMapTile = [
      this.createMapTile(
        'OpenStreetMap Standard',
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        true,
      ),
      this.createMapTile(
        'Stadia Alidade Smooth Light',
        'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png',
        '&copy; <a href="https://stadiamaps.com/" target="_blank">© Stadia Maps</a> <a href="https://openmaptiles.org/" target="_blank" rel="nofollow noopener noreferrer">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>',
        true,
      ),

      this.createMapTile(
        'Stadia Alidade Smooth Dark',
        'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png',
        '&copy; <a href="https://stadiamaps.com/" target="_blank">© Stadia Maps</a> <a href="https://openmaptiles.org/" target="_blank" rel="nofollow noopener noreferrer">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>',
        true,
      ),
    ];

    return defaultMapTile;
  }

  private loadMapTilesData() {
    const defaultMapTiles = this.getDefaultMapTiles();
    const savedMapTiles = this.loadSavedMapTiles();

    const index = parseInt(
      localStorage.getItem(
        this.SELECTED_TILE_INDEX_LOCAL_STORAGE_KEY,
      ) as string,
    );

    const mapTiles = [...defaultMapTiles, ...savedMapTiles];

    if (!isNaN(index) && index < mapTiles.length) {
      this._selectedMapTileSignal = signal(mapTiles[index]);
    } else {
      this._selectedMapTileSignal = signal(mapTiles[0]);
    }

    this._mapTilesSignal.set(mapTiles);
  }

  private loadSavedMapTiles() {
    const savedMapTilesJson = localStorage.getItem(
      this.ADDED_TILES_LOCAL_STORAGE_KEY,
    );

    if (savedMapTilesJson == null) return [];

    const savedMapTiles = JSON.parse(savedMapTilesJson) as MapTileSaveData[];

    if (savedMapTiles.some((tile) => 'custom' in tile)) {
      // Old format, clear localStorage
      localStorage.removeItem(this.ADDED_TILES_LOCAL_STORAGE_KEY);
      return [];
    }

    const mapTiles = [];
    for (const savedMapTile of savedMapTiles) {
      mapTiles.push(
        this.createMapTile(
          savedMapTile.name,
          savedMapTile.url,
          savedMapTile.attribution,
          false,
        ),
      );
    }

    return mapTiles;
  }

  private saveMapTilesEffect() {
    const savedMapTiles: MapTileSaveData[] = this.mapTilesSignal()
      .filter((tile) => !tile.isDefault)
      .map((tile) => {
        return {
          name: tile.name,
          url: tile.url,
          attribution: tile.attribution,
        };
      });

    localStorage.setItem(
      this.ADDED_TILES_LOCAL_STORAGE_KEY,
      JSON.stringify(savedMapTiles),
    );
  }

  private setIndexEffect() {
    const selectedTile = this.selectedMapTileSignal();

    if (selectedTile == null) return;

    const mapTiles = this.mapTilesSignal();

    if (mapTiles.length === 0) return;

    const index = mapTiles.findIndex((tile) => tile === selectedTile);

    if (index === -1) {
      this.selectMapTile(mapTiles[0]);
      return;
    }

    localStorage.setItem(
      this.SELECTED_TILE_INDEX_LOCAL_STORAGE_KEY,
      index.toString(),
    );
  }

  private createTileLayer(url: string, attribution: string | null): TileLayer {
    return tileLayer(url, {
      noWrap: this.NO_WRAP,
      minZoom: this.MINIMUM_ZOOM,
      maxZoom: this.MAXIMUM_ZOOM,
      attribution: attribution ?? undefined,
    });
  }

  private createMapTile(
    name: string,
    url: string,
    attribution: string | null,
    isDefault: boolean,
  ): MapTile {
    return {
      name,
      url,
      attribution,
      tile: this.createTileLayer(url, attribution),
      isDefault,
    };
  }
}

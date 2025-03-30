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
  private readonly KEY_ADDED_TILES: string = 'multimodal.added-tiles';
  private readonly KEY_SELECTED_TILE_INDEX: string =
    'multimodal.selected-tile-index';

  private readonly noWrap = true;
  private readonly minZoom = 8;
  private readonly maxZoom = 18;

  map: Map | null = null;

  private _selectedMapTile!: WritableSignal<MapTile>;
  private _mapTiles: WritableSignal<MapTile[]> = signal([]);

  get selectedMapTile(): Signal<MapTile> {
    return this._selectedMapTile;
  }

  get mapTiles(): Signal<MapTile[]> {
    return this._mapTiles;
  }

  constructor() {
    this.loadMapTilesData();

    effect(() => {
      this.effectSaveMapTiles();
    });

    effect(() => {
      this.effectUpdateIndex();
    });
  }

  selectMapTile(mapTile: MapTile) {
    if (this.map == null) return;

    const selectedMapTile = this._selectedMapTile();
    if (selectedMapTile !== undefined && selectedMapTile !== mapTile) {
      this.map.removeLayer(selectedMapTile.tile);
    }

    this._selectedMapTile.set(mapTile);
    mapTile.tile.addTo(this.map);
  }

  addMapTile(name: string, url: string, attribution: string | null) {
    this._mapTiles.update((mapTiles) => {
      const newTile = this.createMapTile(name, url, attribution, true);
      return [...mapTiles, newTile];
    });
  }

  removeMapTile(tile: MapTile) {
    this._mapTiles.update((mapTiles) => {
      return mapTiles.filter((mapTile) => mapTile !== tile);
    });
  }

  private getDefaultTilesData() {
    const defaultMapTile = [
      this.createMapTile(
        'OpenStreetMap Standard',
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        false,
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
    let tiles = this.loadSavedMapTiles();
    if (tiles.length === 0) {
      tiles = this.getDefaultTilesData();
    }

    const index = parseInt(
      localStorage.getItem(this.KEY_SELECTED_TILE_INDEX) as string,
    );

    if (!isNaN(index) && index < tiles.length) {
      this._selectedMapTile = signal(tiles[index]);
    } else {
      this._selectedMapTile = signal(tiles[0]);
    }

    this._mapTiles.set(tiles);
  }

  private loadSavedMapTiles() {
    const savedMapTilesJson = localStorage.getItem(this.KEY_ADDED_TILES);
    if (savedMapTilesJson == null) return [];

    const savedMapTiles = JSON.parse(savedMapTilesJson) as MapTileSaveData[];

    const mapTiles = [];
    for (const savedMapTile of savedMapTiles) {
      mapTiles.push(
        this.createMapTile(
          savedMapTile.name,
          savedMapTile.url,
          savedMapTile.attribution,
          savedMapTile.custom,
        ),
      );
    }

    return mapTiles;
  }

  private effectSaveMapTiles() {
    const addedMapTiles = this._mapTiles();
    const savedMapTiles: MapTileSaveData[] = addedMapTiles.map((tile) => {
      return {
        name: tile.name,
        url: tile.url,
        attribution: tile.attribution,
        custom: tile.custom,
      };
    });

    localStorage.setItem(this.KEY_ADDED_TILES, JSON.stringify(savedMapTiles));
  }

  private effectUpdateIndex() {
    const selectedTile = this._selectedMapTile();
    if (selectedTile == null) return;

    const mapTiles = this.mapTiles();
    const index = mapTiles.findIndex((tile) => tile === selectedTile);
    if (index === -1) {
      this.selectMapTile(mapTiles[0]);
      return;
    }

    localStorage.setItem(this.KEY_SELECTED_TILE_INDEX, index.toString());
  }

  private createTileLayer(url: string, attribution: string | null): TileLayer {
    return tileLayer(url, {
      noWrap: this.noWrap,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      attribution: attribution ?? undefined,
    });
  }

  private createMapTile(
    name: string,
    url: string,
    attribution: string | null,
    custom: boolean,
  ): MapTile {
    return {
      name,
      url,
      attribution,
      tile: this.createTileLayer(url, attribution),
      custom,
    };
  }
}

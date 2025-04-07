import {
  computed,
  effect,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { SimulationService } from './simulation.service';

interface FavoritesSaveData {
  version: number;
  vehicles: FavoriteInfo[];
  passengers: FavoriteInfo[];
  stops: FavoriteInfo[];
}

export interface FavoriteInfo {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class FavoriteEntitiesService {
  // Arrays to have them sorted
  // Sets to quickly search

  readonly VERSION = 1;
  private readonly KEY_FAVORITES_PREFIX = 'multimodal.favorites.';

  private _favVehicleArray: WritableSignal<FavoriteInfo[]> = signal([]);
  private _favPassengersArray: WritableSignal<FavoriteInfo[]> = signal([]);
  private _favStopsArray: WritableSignal<FavoriteInfo[]> = signal([]);

  private _simulationFavKey: Signal<string | null> = computed(() => {
    const simulation = this.simulationService.activeSimulationSignal();
    if (!simulation) return null;
    return `${this.KEY_FAVORITES_PREFIX}${simulation.id}`;
  });

  get favVehicleArray(): Signal<FavoriteInfo[]> {
    return this._favVehicleArray;
  }

  get favPassengersArray(): Signal<FavoriteInfo[]> {
    return this._favPassengersArray;
  }

  get favStopsArray(): Signal<FavoriteInfo[]> {
    return this._favStopsArray;
  }

  favVehicleIds: Signal<Set<string>> = computed(
    () => new Set(this._favVehicleArray().map((favorite) => favorite.id)),
  );
  favPassengerIds: Signal<Set<string>> = computed(
    () => new Set(this.favPassengersArray().map((favorite) => favorite.id)),
  );
  favStopIds: Signal<Set<string>> = computed(
    () => new Set(this._favStopsArray().map((favorite) => favorite.id)),
  );

  constructor(private simulationService: SimulationService) {
    effect(() => {
      this.loadFavoritesFromLocalStorage();
    });

    effect(() => {
      this.saveFavoritesToLocalStorage();
    });
  }

  toggleFavoriteVehicle(id: string, name: string) {
    this._favVehicleArray.update((favVehicleArray) => {
      return this.toggleFavoriteEntity(favVehicleArray, id, name);
    });
  }

  toggleFavoritePassenger(id: string, name: string) {
    this._favPassengersArray.update((favPassengerArray) => {
      return this.toggleFavoriteEntity(favPassengerArray, id, name);
    });
  }

  toggleFavoriteStop(id: string) {
    this._favStopsArray.update((favStopsArray) => {
      return this.toggleFavoriteEntity(favStopsArray, id, id);
    });
  }

  toggleFavoriteEntity(favorites: FavoriteInfo[], id: string, name: string) {
    // If is in the list
    if (favorites.find((favorite) => favorite.id === id)) {
      // Remove from list
      favorites = favorites.filter((favorite) => favorite.id !== id);
    } else {
      favorites.push({ id, name });
      favorites.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...favorites];
  }

  private loadFavoritesFromLocalStorage() {
    const simulationFavKey = this._simulationFavKey();
    if (simulationFavKey === null) {
      this._favVehicleArray.set([]);
      this._favPassengersArray.set([]);
      this._favStopsArray.set([]);
      return;
    }

    const favoritesSaveDataJson = localStorage.getItem(simulationFavKey);
    if (!favoritesSaveDataJson) return;

    const favoritesSaveData = JSON.parse(
      favoritesSaveDataJson,
    ) as FavoritesSaveData;

    if (
      !favoritesSaveData.version ||
      favoritesSaveData.version !== this.VERSION
    )
      return;

    this._favVehicleArray.set(favoritesSaveData.vehicles);
    this._favPassengersArray.set(favoritesSaveData.passengers);
    this._favStopsArray.set(favoritesSaveData.stops);
  }

  private saveFavoritesToLocalStorage() {
    const simulationFavKey = this._simulationFavKey();
    if (simulationFavKey === null) return;

    const favoritesSaveData: FavoritesSaveData = {
      version: this.VERSION,
      vehicles: this._favVehicleArray(),
      passengers: this._favPassengersArray(),
      stops: this._favStopsArray(),
    };

    localStorage.setItem(simulationFavKey, JSON.stringify(favoritesSaveData));
  }
}

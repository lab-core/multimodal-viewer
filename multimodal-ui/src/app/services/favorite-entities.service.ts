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
  vehicles: string[];
  passengers: string[];
  stops: string[];
}

@Injectable({
  providedIn: 'root',
})
export class FavoriteEntitiesService {
  // Arrays to have them sorted
  // Sets to quickly search

  private readonly KEY_FAVORITES_PREFIX = 'multimodal.favorites.';

  private _favVehicleArray: WritableSignal<string[]> = signal([]);
  private _favPassengersArray: WritableSignal<string[]> = signal([]);
  private _favStopsArray: WritableSignal<string[]> = signal([]);

  private _simulationFavKey: Signal<string | null> = computed(() => {
    const simulation = this.simulationService.activeSimulationSignal();
    if (!simulation) return null;
    return `${this.KEY_FAVORITES_PREFIX}${simulation.id}`;
  });

  favVehicleIds: Signal<Set<string>> = computed(
    () => new Set(this._favVehicleArray()),
  );
  favPassengerIds: Signal<Set<string>> = computed(
    () => new Set(this._favPassengersArray()),
  );
  favStopIds: Signal<Set<string>> = computed(
    () => new Set(this._favStopsArray()),
  );

  constructor(private simulationService: SimulationService) {
    effect(() => {
      this.loadFavoritesFromLocalStorage();
    });

    effect(() => {
      this.saveFavoritesToLocalStorage();
    });
  }

  toggleFavoriteVehicle(id: string) {
    this._favVehicleArray.update((favVehicleArray) => {
      return this.toggleFavoriteEntity(favVehicleArray, id);
    });
  }

  toggleFavoritePassenger(id: string) {
    this._favPassengersArray.update((favPassengerArray) => {
      return this.toggleFavoriteEntity(favPassengerArray, id);
    });
  }

  toggleFavoriteStop(id: string) {
    this._favStopsArray.update((favStopsArray) => {
      return this.toggleFavoriteEntity(favStopsArray, id);
    });
  }

  toggleFavoriteEntity(entities: string[], id: string) {
    // If is in the list
    if (entities.find((_id) => _id === id)) {
      // Remove from list
      entities = entities.filter((_id) => _id !== id);
    } else {
      entities.push(id);
      entities.sort();
    }
    return [...entities];
  }

  private loadFavoritesFromLocalStorage() {
    const simulationFavKey = this._simulationFavKey();
    if (simulationFavKey === null) {
      this._favVehicleArray.set([]);
      this._favPassengersArray.set([]);
      return;
    }

    const favoritesSaveDataJson = localStorage.getItem(simulationFavKey);
    if (!favoritesSaveDataJson) return;

    const favoritesSaveData = JSON.parse(
      favoritesSaveDataJson,
    ) as FavoritesSaveData;

    this._favVehicleArray.set(favoritesSaveData.vehicles);
    this._favPassengersArray.set(favoritesSaveData.passengers);
    this._favStopsArray.set(favoritesSaveData.stops);
  }

  private saveFavoritesToLocalStorage() {
    const simulationFavKey = this._simulationFavKey();
    if (simulationFavKey === null) return;

    const favoritesSaveData: FavoritesSaveData = {
      vehicles: this._favVehicleArray(),
      passengers: this._favPassengersArray(),
      stops: this._favStopsArray(),
    };

    localStorage.setItem(simulationFavKey, JSON.stringify(favoritesSaveData));
  }
}

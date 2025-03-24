import {
  computed,
  effect,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class FavoriteEntitiesService {
  // Arrays to have them sorted
  // Sets to quickly search

  private readonly KEY_FAVORITE_VEHICLES = 'multimodal.favorite-vehicles';
  private readonly KEY_FAVORITE_PASSENGERS = 'multimodal.favorite-passengers';

  private _favVehicleArray: WritableSignal<string[]> = signal([]);
  private _favPassengersArray: WritableSignal<string[]> = signal([]);

  favVehicleIds: Signal<Set<string>> = computed(
    () => new Set(this._favVehicleArray()),
  );
  favPassengerIds: Signal<Set<string>> = computed(
    () => new Set(this._favPassengersArray()),
  );

  constructor() {
    this.loadFavoritesFromLocalStorage();

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
    const favoriteVehiclesJson = localStorage.getItem(
      this.KEY_FAVORITE_VEHICLES,
    );
    if (favoriteVehiclesJson) {
      this._favVehicleArray.set(JSON.parse(favoriteVehiclesJson) as string[]);
    }

    const favoritePassengersJson = localStorage.getItem(
      this.KEY_FAVORITE_PASSENGERS,
    );
    if (favoritePassengersJson) {
      this._favPassengersArray.set(
        JSON.parse(favoritePassengersJson) as string[],
      );
    }
  }

  private saveFavoritesToLocalStorage() {
    localStorage.setItem(
      this.KEY_FAVORITE_VEHICLES,
      JSON.stringify(this._favVehicleArray()),
    );

    localStorage.setItem(
      this.KEY_FAVORITE_PASSENGERS,
      JSON.stringify(this._favPassengersArray()),
    );
  }
}

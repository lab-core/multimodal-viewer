import { Injectable, Signal, signal, WritableSignal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class FavoriteEntitiesService {
  private _favVehicleIds: WritableSignal<string[]> = signal([]);
  private _favPassengersIds: WritableSignal<string[]> = signal([]);

  get favVehicleIds(): Signal<string[]> {
    return this._favVehicleIds;
  }

  get favPassengerIds(): Signal<string[]> {
    return this._favPassengersIds;
  }

  addFavoriteVehicle(id: string) {
    this._favVehicleIds.update((ids) => {
      if (ids.find((tid) => tid === id) !== undefined) return ids;
      return [...ids, id].sort();
    });
  }

  addFavoritePassenger(id: string) {
    this._favPassengersIds.update((ids) => {
      if (ids.find((tid) => tid === id) !== undefined) return ids;
      return [...ids, id].sort();
    });
  }

  removeVehicle(id: string) {
    this._favVehicleIds.set(this.favVehicleIds().filter((tid) => tid !== id));
  }

  removePassenger(id: string) {
    this._favPassengersIds.set(
      this.favPassengerIds().filter((tid) => tid !== id),
    );
  }
}

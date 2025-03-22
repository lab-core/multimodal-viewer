import { Injectable, Signal, signal, WritableSignal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class FavoriteEntitiesService {
  private _favVehicleArray: string[] = [];
  private _favPassengersArray: string[] = [];

  private _favVehicles: WritableSignal<Set<string>> = signal(new Set());
  private _favPassengers: WritableSignal<Set<string>> = signal(new Set());

  get favVehicleIds(): Signal<Set<string>> {
    return this._favVehicles;
  }

  get favPassengerIds(): Signal<Set<string>> {
    return this._favPassengers;
  }

  constructor() {
    for (let i = 0; i < 9; i++) this._favVehicleArray.push(i.toString());
    this._favVehicles.set(new Set(this._favVehicleArray));
  }

  isFavoriteVehicle(id: string) {
    return this._favVehicles().has(id);
  }

  isFavoritePassenger(id: string) {
    return this._favPassengers().has(id);
  }

  toggleFavoriteVehicle(id: string) {
    // If is in the list
    if (this._favVehicleArray.find((_id) => _id === id)) {
      // Remove from list
      this._favVehicleArray = this._favVehicleArray.filter((_id) => _id !== id);
    } else {
      this._favVehicleArray.push(id);
      this._favVehicleArray.sort();
    }

    this._favVehicles.set(new Set([...this._favVehicleArray]));
  }

  toggleFavoritePassenger(id: string) {
    // If is in the list
    if (this._favPassengersArray.find((_id) => _id === id)) {
      // Remove from list
      this._favPassengersArray = this._favPassengersArray.filter(
        (_id) => _id !== id,
      );
    } else {
      this._favPassengersArray.push(id);
      this._favPassengersArray.sort();
    }

    this._favPassengers.set(new Set([...this._favPassengersArray]));
  }
}

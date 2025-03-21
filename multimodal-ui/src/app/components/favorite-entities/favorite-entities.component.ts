import { Component, Signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { FavoriteEntitiesService } from '../../services/favorite-entities.service';

@Component({
  selector: 'app-favorite-entities',
  imports: [MatCardModule, MatChipsModule, MatIconModule],
  templateUrl: './favorite-entities.component.html',
  styleUrl: './favorite-entities.component.css',
})
export class FavoriteEntitiesComponent {
  favVehicleIds: Signal<string[]>;
  favPassengerIds: Signal<string[]>;

  constructor(readonly favoriteEntitiesService: FavoriteEntitiesService) {
    this.favVehicleIds = favoriteEntitiesService.favVehicleIds;
    this.favPassengerIds = favoriteEntitiesService.favPassengerIds;
  }

  // selectVehicle(id: string) {
  // }

  // selectPassenger(id: string) {
  // }

  unfavVehicle(id: string) {
    this.favoriteEntitiesService.removeVehicle(id);
  }

  unfavPassenger(id: string) {
    this.favoriteEntitiesService.removePassenger(id);
  }
}

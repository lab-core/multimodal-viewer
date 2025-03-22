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
  favVehicleIds: Signal<Set<string>>;
  favPassengerIds: Signal<Set<string>>;

  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
  ) {
    this.favVehicleIds = favoriteEntitiesService.favVehicleIds;
    this.favPassengerIds = favoriteEntitiesService.favPassengerIds;
  }

  toggleFavoriteVehicle(id: string) {
    this.favoriteEntitiesService.toggleFavoriteVehicle(id);
  }

  toggleFavoritePassenger(id: string) {
    this.favoriteEntitiesService.toggleFavoritePassenger(id);
  }
}

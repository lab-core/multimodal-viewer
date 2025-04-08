import { Component, computed, Signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EntityInfo } from '../../interfaces/entity.model';
import { AnimationService } from '../../services/animation.service';
import { FavoriteEntitiesService } from '../../services/favorite-entities.service';
import { VisualizationService } from '../../services/visualization.service';

@Component({
  selector: 'app-favorite-entities',
  imports: [MatCardModule, MatChipsModule, MatIconModule, MatTooltipModule],
  templateUrl: './favorite-entities.component.html',
  styleUrl: './favorite-entities.component.css',
})
export class FavoriteEntitiesComponent {
  favVehicles: Signal<EntityInfo[]>;
  favPassengers: Signal<EntityInfo[]>;
  favStops: Signal<EntityInfo[]>;

  readonly favoriteCount: Signal<number> = computed(() => {
    return (
      this.favVehicles().length +
      this.favPassengers().length +
      this.favStops().length
    );
  });

  isVehicleInEnvironment(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return false;

    if (visualizationEnvironment.vehicles[id]) return true;
    else return false;
  }

  isPassengerInEnvironment(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return false;

    if (visualizationEnvironment.passengers[id]) return true;
    else return false;
  }

  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly visualizationService: VisualizationService,
    private readonly animationService: AnimationService,
  ) {
    this.favVehicles = favoriteEntitiesService.favVehicleArray;
    this.favPassengers = favoriteEntitiesService.favPassengersArray;
    this.favStops = favoriteEntitiesService.favStopsArray;
  }

  toggleFavoriteVehicle(id: string, name: string) {
    this.favoriteEntitiesService.toggleFavoriteVehicle(id, name);
  }

  toggleFavoritePassenger(id: string, name: string) {
    this.favoriteEntitiesService.toggleFavoritePassenger(id, name);
  }

  toggleFavoriteStop(id: string) {
    this.favoriteEntitiesService.toggleFavoriteStop(id);
  }

  selectVehicle(id: string) {
    this.animationService.selectEntity(id, 'vehicle');
  }

  selectPassenger(id: string) {
    this.animationService.selectEntity(id, 'passenger');
  }

  selectStop(id: string) {
    this.animationService.selectEntity(id, 'stop');
  }
}

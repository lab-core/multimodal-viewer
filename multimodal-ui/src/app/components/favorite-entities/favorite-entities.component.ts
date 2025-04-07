import { Component, computed, Signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
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
  favVehicleIds: Signal<Set<string>>;
  favPassengerIds: Signal<Set<string>>;
  favStopIds: Signal<Set<string>>;

  readonly allFavIdsSignal: Signal<Set<string>> = computed(
    () =>
      new Set([
        ...this.favVehicleIds(),
        ...this.favPassengerIds(),
        ...this.favStopIds(),
      ]),
  );

  isVehicleInEnvironment(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return false;

    if (visualizationEnvironment.currentState.vehicles[id]) return true;
    else return false;
  }

  isPassengerInEnvironment(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return false;

    if (visualizationEnvironment.currentState.passengers[id]) return true;
    else return false;
  }

  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly visualizationService: VisualizationService,
    private readonly animationService: AnimationService,
  ) {
    this.favVehicleIds = favoriteEntitiesService.favVehicleIds;
    this.favPassengerIds = favoriteEntitiesService.favPassengerIds;
    this.favStopIds = favoriteEntitiesService.favStopIds;
  }

  toggleFavoriteVehicle(id: string) {
    this.favoriteEntitiesService.toggleFavoriteVehicle(id);
  }

  toggleFavoritePassenger(id: string) {
    this.favoriteEntitiesService.toggleFavoritePassenger(id);
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

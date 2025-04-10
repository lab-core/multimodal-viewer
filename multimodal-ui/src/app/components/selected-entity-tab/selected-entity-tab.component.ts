import { Component, Input, effect } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedStop,
  AnimatedVehicle,
  getAllLegs,
} from '../../interfaces/simulation.model';
import { AnimationService } from '../../services/animation.service';
import { FavoriteEntitiesService } from '../../services/favorite-entities.service';
import { SelectedEntityRouteComponent } from '../selected-entity-route/selected-entity-route.component';
import { VisualizationService } from '../../services/visualization.service';

@Component({
  selector: 'app-selected-entity-tab',
  imports: [
    MatCardModule,
    MatTooltipModule,
    MatIconModule,
    MatExpansionModule,
    SelectedEntityRouteComponent,
    MatDividerModule,
  ],
  templateUrl: './selected-entity-tab.component.html',
  styleUrl: './selected-entity-tab.component.css',
})
export class SelectedEntityTabComponent {
  @Input({ required: true }) selectedPassenger: AnimatedPassenger | null = null;
  @Input({ required: true }) selectedPassengerStop: AnimatedStop | null = null;
  @Input({ required: true }) selectedPassengerVehicle: AnimatedVehicle | null =
    null;

  @Input({ required: true }) selectedVehicle: AnimatedVehicle | null = null;
  @Input({ required: true }) selectedVehicleStop: AnimatedStop | null = null;
  @Input({ required: true }) selectedVehiclePassengers: AnimatedPassenger[] =
    [];

  @Input({ required: true }) selectedStop: AnimatedStop | null = null;
  @Input({ required: true })
  selectedStopWaitingPassengers: AnimatedPassenger[] = [];
  @Input({ required: true })
  selectedStopCompletedPassengers: AnimatedPassenger[] = [];
  @Input({ required: true }) selectedStopVehicles: AnimatedVehicle[] = [];

  protected environment: AnimatedSimulationEnvironment | null;

  constructor(
    private readonly animationService: AnimationService,
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private snackBar: MatSnackBar,
    private visualizationService: VisualizationService,
  ) {
    this.environment = null;
    effect(() => {
      this.environment =
        this.visualizationService.visualizationEnvironmentSignal();
    });
  }

  get selectedPassengerLegs() {
    const passenger = this.selectedPassenger;
    return passenger === null ? [] : getAllLegs(passenger);
  }

  copyToClipboard(text: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.snackBar.open('Copied to clipboard!', 'Close', {
          duration: 2000,
        });
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        this.snackBar.open('Failed to copy!', 'Close', {
          duration: 2000,
        });
      });
  }

  truncateId(id: string): string {
    const maxLength = 20;
    return id.length > maxLength ? `${id.slice(0, maxLength)}...` : id;
  }

  // Favorite function
  isFavoritePassenger(id: string) {
    return this.favoriteEntitiesService.favPassengerIds().has(id);
  }

  toggleFavoritePassenger(id: string, name: string | null) {
    this.favoriteEntitiesService.toggleFavoritePassenger(id, name ?? id);
  }

  isFavoriteVehicle(id: string) {
    return this.favoriteEntitiesService.favVehicleIds().has(id);
  }

  toggleFavoriteVehicle(id: string, name: string) {
    this.favoriteEntitiesService.toggleFavoriteVehicle(id, name);
  }

  isFavoriteStop(stop: AnimatedStop) {
    return this.favoriteEntitiesService.favStopIds().has(stop.id);
  }

  toggleFavoriteStop(stop: AnimatedStop) {
    this.favoriteEntitiesService.toggleFavoriteStop(stop.id);
  }

  // Select function
  selectStop(stop: AnimatedStop) {
    this.animationService.selectEntity(stop.id, 'stop');
  }

  selectVehicle(id: string) {
    this.animationService.selectEntity(id, 'vehicle');
  }

  selectPassenger(id: string) {
    this.animationService.selectEntity(id, 'passenger');
  }
}

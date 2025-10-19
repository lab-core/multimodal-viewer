import { Component, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EntityMetadata } from '../../interfaces/entity.model';
import { getAllLegs, Passenger } from '../../interfaces/passenger.model';
import { Stop } from '../../interfaces/stop.model';
import { getAllStops, Vehicle } from '../../interfaces/vehicle.model';
import { AnimationService } from '../../services/animation.service';
import { FavoriteEntitiesService } from '../../services/favorite-entities.service';
import { SnackBarService } from '../../services/snack-bar.service';
import { VisualizationService } from '../../services/visualization.service';
import { EntityNameComponent } from '../entity-name/entity-name.component';
import { SelectedEntityRouteComponent } from '../selected-entity-route/selected-entity-route.component';

@Component({
  selector: 'app-selected-entity-tab',
  imports: [
    MatCardModule,
    MatTooltipModule,
    MatIconModule,
    MatExpansionModule,
    SelectedEntityRouteComponent,
    MatDividerModule,
    EntityNameComponent,
  ],
  templateUrl: './selected-entity-tab.component.html',
  styleUrl: './selected-entity-tab.component.css',
})
export class SelectedEntityTabComponent {
  private readonly animationService = inject(AnimationService);
  private readonly favoriteEntitiesService = inject(FavoriteEntitiesService);
  private readonly snackBarService = inject(SnackBarService);
  private readonly visualizationService = inject(VisualizationService);

  readonly selectedPassengerSignal = input.required<Passenger | null>({
    alias: 'selectedPassenger',
  });
  readonly selectedPassengerStopSignal = input.required<Stop | null>({
    alias: 'selectedPassengerStop',
  });
  readonly selectedPassengerVehicleSignal = input.required<Vehicle | null>({
    alias: 'selectedPassengerVehicle',
  });

  readonly selectedVehicleSignal = input.required<Vehicle | null>({
    alias: 'selectedVehicle',
  });
  readonly selectedVehicleStopSignal = input.required<Stop | null>({
    alias: 'selectedVehicleStop',
  });
  readonly selectedVehiclePassengersSignal = input.required<Passenger[]>({
    alias: 'selectedVehiclePassengers',
  });

  readonly selectedStopSignal = input.required<Stop | null>({
    alias: 'selectedStop',
  });
  readonly selectedStopWaitingPassengersSignal = input.required<Passenger[]>({
    alias: 'selectedStopWaitingPassengers',
  });
  readonly selectedStopCompletedPassengersSignal = input.required<Passenger[]>({
    alias: 'selectedStopCompletedPassengers',
  });
  readonly selectedStopVehiclesSignal = input.required<Vehicle[]>({
    alias: 'selectedStopVehicles',
  });

  get selectedPassengerLegs() {
    const passenger = this.selectedPassengerSignal();
    return passenger === null ? [] : getAllLegs(passenger);
  }

  get environmentSignal() {
    return this.visualizationService.environmentSignal;
  }

  get selectedVehiclePassengerTags() {
    const selectedVehiclePassengers = this.selectedVehiclePassengersSignal();

    return selectedVehiclePassengers
      .flatMap((passenger) => passenger.tags)
      .filter((tag, index, self) => self.indexOf(tag) === index)
      .sort((a, b) => a.localeCompare(b));
  }

  get selectedStopPassengerTags() {
    const selectedStopWaitingPassengers =
      this.selectedStopWaitingPassengersSignal();

    return selectedStopWaitingPassengers
      .flatMap((passenger) => passenger.tags)
      .filter((tag, index, self) => self.indexOf(tag) === index)
      .sort((a, b) => a.localeCompare(b));
  }

  get selectedPassengerLegStops() {
    const selectedPassenger = this.selectedPassengerSignal();
    if (selectedPassenger === null) {
      return [];
    }

    if (selectedPassenger.currentLeg === null) {
      return [];
    }

    const selectedPassengerVehicle = this.selectedPassengerVehicleSignal();
    if (selectedPassengerVehicle === null) {
      return [];
    }

    if (
      selectedPassenger.currentLeg.boardingStopIndex === null ||
      selectedPassenger.currentLeg.alightingStopIndex === null
    ) {
      return [];
    }

    const allStops = getAllStops(selectedPassengerVehicle);

    if (
      selectedPassenger.currentLeg.boardingStopIndex < 0 ||
      selectedPassenger.currentLeg.boardingStopIndex >= allStops.length ||
      selectedPassenger.currentLeg.alightingStopIndex < 0 ||
      selectedPassenger.currentLeg.alightingStopIndex >= allStops.length
    ) {
      return [];
    }

    return allStops.slice(
      selectedPassenger.currentLeg.boardingStopIndex,
      selectedPassenger.currentLeg.alightingStopIndex + 1,
    );
  }

  get selectedPassengerLegPreviousStops() {
    return this.selectedPassengerLegStops.filter(
      (stop) => stop.stopType === 'previous',
    );
  }

  get selectedPassengerLegCurrentStop() {
    return (
      this.selectedPassengerLegStops.find(
        (stop) => stop.stopType === 'current',
      ) ?? null
    );
  }

  get selectedPassengerLegNextStops() {
    return this.selectedPassengerLegStops.filter(
      (stop) => stop.stopType === 'next',
    );
  }

  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);

      this.snackBarService.showMessage('Copied to clipboard!', 'info');
    } catch (error) {
      console.error('Failed to copy text: ', error);
      this.snackBarService.showMessage('Failed to copy!', 'error');
    }
  }

  truncateId(id: string): string {
    const maxLength = 20;
    return id.length > maxLength ? `${id.slice(0, maxLength)}...` : id;
  }

  isFavoriteEntity(entity: EntityMetadata) {
    return this.favoriteEntitiesService.isFavoriteEntity(entity);
  }

  toggleFavoriteEntity(entity: EntityMetadata) {
    this.favoriteEntitiesService.toggleFavoriteEntity(entity);
  }

  preselectEntity(passenger: EntityMetadata) {
    this.animationService.preselectEntity(passenger, false);
  }

  unpreselectEntity() {
    this.animationService.unpreselectEntity();
  }

  // Select function
  selectEntity(entity: EntityMetadata) {
    this.animationService.selectEntity(entity);
  }

  // Highlight function
  highlightLeg(legIndex: number) {
    if (this.selectedPassengerSignal()) {
      this.animationService.highlightLeg(legIndex);
    }
  }

  unhighlightLeg() {
    this.animationService.unhighlightLeg();
  }
}

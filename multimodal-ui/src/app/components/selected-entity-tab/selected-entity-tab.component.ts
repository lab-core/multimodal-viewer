import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EntityMetadata } from '../../interfaces/entity.model';
import { getAllLegs, Passenger } from '../../interfaces/passenger.model';
import { Stop } from '../../interfaces/stop.model';
import { getAllStops, Vehicle } from '../../interfaces/vehicle.model';
import { AnimationService } from '../../services/animation.service';
import { FavoriteEntitiesService } from '../../services/favorite-entities.service';
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
  @Input({ required: true }) selectedPassenger: Passenger | null = null;
  @Input({ required: true }) selectedPassengerStop: Stop | null = null;
  @Input({ required: true }) selectedPassengerVehicle: Vehicle | null = null;

  @Input({ required: true }) selectedVehicle: Vehicle | null = null;
  @Input({ required: true }) selectedVehicleStop: Stop | null = null;
  @Input({ required: true }) selectedVehiclePassengers: Passenger[] = [];

  @Input({ required: true }) selectedStop: Stop | null = null;
  @Input({ required: true })
  selectedStopWaitingPassengers: Passenger[] = [];
  @Input({ required: true })
  selectedStopCompletedPassengers: Passenger[] = [];
  @Input({ required: true }) selectedStopVehicles: Vehicle[] = [];

  constructor(
    private readonly animationService: AnimationService,
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly snackBar: MatSnackBar,
    private readonly visualizationService: VisualizationService,
  ) {}

  get selectedPassengerLegs() {
    const passenger = this.selectedPassenger;
    return passenger === null ? [] : getAllLegs(passenger);
  }

  get environmentSignal() {
    return this.visualizationService.environmentSignal;
  }

  get selectedVehiclePassengerTags() {
    const selectedVehiclePassengers = this.selectedVehiclePassengers;

    return selectedVehiclePassengers
      .flatMap((passenger) => passenger.tags)
      .filter((tag, index, self) => self.indexOf(tag) === index)
      .sort((a, b) => a.localeCompare(b));
  }

  get selectedStopPassengerTags() {
    const selectedStopWaitingPassengers = this.selectedStopWaitingPassengers;

    return selectedStopWaitingPassengers
      .flatMap((passenger) => passenger.tags)
      .filter((tag, index, self) => self.indexOf(tag) === index)
      .sort((a, b) => a.localeCompare(b));
  }

  get selectedPassengerLegStops() {
    if (this.selectedPassenger === null) {
      return [];
    }

    if (this.selectedPassenger.currentLeg === null) {
      return [];
    }

    if (this.selectedPassengerVehicle === null) {
      return [];
    }

    if (
      this.selectedPassenger.currentLeg.boardingStopIndex === null ||
      this.selectedPassenger.currentLeg.alightingStopIndex === null
    ) {
      return [];
    }

    const allStops = getAllStops(this.selectedPassengerVehicle);

    if (
      this.selectedPassenger.currentLeg.boardingStopIndex < 0 ||
      this.selectedPassenger.currentLeg.boardingStopIndex >= allStops.length ||
      this.selectedPassenger.currentLeg.alightingStopIndex < 0 ||
      this.selectedPassenger.currentLeg.alightingStopIndex >= allStops.length
    ) {
      return [];
    }

    return allStops.slice(
      this.selectedPassenger.currentLeg.boardingStopIndex,
      this.selectedPassenger.currentLeg.alightingStopIndex + 1,
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
    if (this.selectedPassenger) {
      this.animationService.highlightLeg(legIndex);
    }
  }

  unhighlightLeg() {
    this.animationService.unhighlightLeg();
  }
}

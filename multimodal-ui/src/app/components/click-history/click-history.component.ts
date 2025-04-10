import {
  Component,
  effect,
  signal,
  Signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VisualizationService } from '../../services/visualization.service';
import { AnimationService } from '../../services/animation.service';
import { EntityType } from '../../interfaces/entity.model';
import { MatButtonModule } from '@angular/material/button';

export interface HistoryItem {
  id: string;
  name: string;
  type: EntityType;
}
@Component({
  selector: 'app-click-history',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './click-history.component.html',
  styleUrl: './click-history.component.scss',
})
export class ClickHistoryComponent {
  history: WritableSignal<HistoryItem[]> = signal([]);

  constructor(
    private readonly visualizationService: VisualizationService,
    private readonly animationService: AnimationService,
  ) {
    effect(() => {
      this.effectOnVehicleSelected();
    });

    effect(() => {
      this.effectOnPassengerSelected();
    });

    effect(() => {
      this.effectOnStopSelected();
    });
  }

  clearHistory() {
    this.history.set([]);
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

  private effectOnVehicleSelected() {
    const vehicleId = this.animationService.selectedVehicleIdSignal();
    if (vehicleId === null) return;

    const vehicle = untracked(() => this.getVehicle(vehicleId));
    if (vehicle == null) return;

    this.addHistory(vehicle.id, vehicle.name, 'vehicle');
  }

  private effectOnPassengerSelected() {
    const passengerId = this.animationService.selectedPassengerIdSignal();
    if (passengerId === null) return;

    const passenger = untracked(() => this.getPassenger(passengerId));
    if (passenger == null) return;

    this.addHistory(passenger.id, passenger.name ?? passenger.id, 'passenger');
  }

  private effectOnStopSelected() {
    const stopId = this.animationService.selectedStopIdSignal();
    if (stopId === null) return;

    const stop = untracked(() => this.getStop(stopId));
    if (stop == null) return;

    this.addHistory(stop.id, stop.label, 'stop');
  }

  private addHistory(id: string, name: string, type: EntityType) {
    this.history.update((history) => {
      const index = history.findIndex((item) => item.id === id);
      if (index !== -1) history.splice(index, 1);
      return [{ id, name, type }, ...history];
    });
  }

  private getVehicle(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return undefined;

    return visualizationEnvironment.currentState.vehicles[id];
  }

  private getPassenger(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return undefined;

    return visualizationEnvironment.currentState.passengers[id];
  }

  private getStop(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return undefined;

    return visualizationEnvironment.currentState.stops[id];
  }
}

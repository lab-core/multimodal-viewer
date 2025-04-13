import { Component, computed, Signal } from '@angular/core';
import {
  DataEntity,
  Passenger,
  Vehicle,
} from '../../interfaces/simulation.model';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AnimationService } from '../../services/animation.service';
import { VisualizationService } from '../../services/visualization.service';

@Component({
  selector: 'app-entities-tab',
  imports: [MatExpansionModule, MatTooltipModule],
  templateUrl: './entities-tab.component.html',
  styleUrl: './entities-tab.component.css',
})
export class EntitiesTabComponent {
  // MARK: Properties
  readonly getPassengers: Signal<Passenger[]> = computed(() => {
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (environment === null) {
      return [];
    }
    return Object.values(environment.passengers);
  });

  readonly numberOfPassengersByStatusSignal: Signal<
    {
      status: string;
      count: number;
      passengers: Passenger[];
    }[]
  > = computed(() => {
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (environment === null) {
      return [];
    }

    const passengers = Object.values(environment.passengers);
    const counts: Record<string, Passenger[]> = {};

    for (const passenger of passengers) {
      const status = passenger.status;
      counts[status] = counts[status] ?? [];
      counts[status].push(passenger);
    }

    return Object.entries(counts).map(([status, passengers]) => ({
      status,
      count: passengers.length,
      passengers,
    }));
  });

  readonly getVehicles: Signal<Vehicle[]> = computed(() => {
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (environment === null) {
      return [];
    }
    return Object.values(environment.vehicles);
  });

  readonly numberOfVehiclesByStatusSignal: Signal<
    {
      status: string;
      count: number;
      vehicles: Vehicle[];
    }[]
  > = computed(() => {
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();

    if (environment === null) {
      return [];
    }

    const vehicles = Object.values(environment.vehicles);
    const counts: Record<string, Vehicle[]> = {};

    for (const vehicle of vehicles) {
      const status = vehicle.status;
      counts[status] = counts[status] ?? [];
      counts[status].push(vehicle);
    }

    return Object.entries(counts).map(([status, vehicles]) => ({
      status,
      count: vehicles.length,
      vehicles,
    }));
  });

  constructor(
    private readonly animationService: AnimationService,
    private readonly visualizationService: VisualizationService,
  ) {}

  preselectEntity(entity: DataEntity) {
    this.animationService.preselectEntity(entity);
  }

  unpreselectEntity() {
    this.animationService.preselectEntity(null);
  }

  selectPassenger(id: string) {
    this.animationService.selectEntity(id, 'passenger');
  }

  selectVehicle(id: string) {
    this.animationService.selectEntity(id, 'vehicle');
  }
}

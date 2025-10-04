import { Component, computed, Signal } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EntityMetadata } from '../../interfaces/entity.model';
import { Passenger } from '../../interfaces/passenger.model';
import { Vehicle } from '../../interfaces/vehicle.model';
import { AnimationService } from '../../services/animation.service';
import { VisualizationService } from '../../services/visualization.service';
import { EntityNameComponent } from '../entity-name/entity-name.component';

@Component({
  selector: 'app-entities-tab',
  imports: [MatExpansionModule, MatTooltipModule, EntityNameComponent],
  templateUrl: './entities-tab.component.html',
  styleUrl: './entities-tab.component.css',
})
export class EntitiesTabComponent {
  // MARK: Properties
  readonly passengersSignal: Signal<Passenger[]> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return [];
    }

    return environment.allPassengers;
  });

  readonly numberOfPassengersByStatusSignal: Signal<
    {
      status: string;
      count: number;
      passengers: Passenger[];
    }[]
  > = computed(() => {
    const passengers = this.passengersSignal();

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

  readonly vehiclesSignal: Signal<Vehicle[]> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return [];
    }

    return environment.allVehicles;
  });

  readonly numberOfVehiclesByStatusSignal: Signal<
    {
      status: string;
      count: number;
      vehicles: Vehicle[];
    }[]
  > = computed(() => {
    const vehicles = this.vehiclesSignal();

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

  // MARK: Constructor
  constructor(
    private readonly animationService: AnimationService,
    private readonly visualizationService: VisualizationService,
  ) {}

  // MARK: Methods
  preselectEntity(entity: EntityMetadata) {
    this.animationService.preselectEntity(entity, false);
  }

  unpreselectEntity() {
    this.animationService.unpreselectEntity();
  }

  selectEntity(entity: EntityMetadata) {
    this.animationService.selectEntity(entity);
  }
}

import {
  computed,
  effect,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import {
  AnySimulationUpdate,
  Passenger,
  PASSENGER_STATUSES,
  PassengerStatusUpdate,
  Simulation,
  SIMULATION_UPDATE_TYPES,
  SimulationEnvironment,
  Vehicle,
  VEHICLE_STATUSES,
  VehiclePositionUpdate,
  VehicleStatusUpdate,
} from '../interfaces/simulation.model';
import { CommunicationService } from './communication.service';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root',
})
export class SimulationService {
  private readonly _activeSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly activeSimulationUpdatesSignal: WritableSignal<
    AnySimulationUpdate[]
  > = signal([]);

  private readonly validatedActiveSimulationUpdatesSignal: Signal<
    AnySimulationUpdate[]
  > = computed(() => {
    // TODO Better validation : keep track of the last validated order

    const activeSimulationUpdates = this.activeSimulationUpdatesSignal();

    const sortedActiveSimulationUpdates = activeSimulationUpdates.sort(
      (a, b) => a.order - b.order,
    );

    // Validate the order of the simulation updates.
    const validatedActiveSimulationUpdates: AnySimulationUpdate[] = [];
    let expectedOrder = 0;
    for (const update of sortedActiveSimulationUpdates) {
      if (update.order === expectedOrder) {
        validatedActiveSimulationUpdates.push(update);
        expectedOrder++;
      } else {
        break;
      }
    }

    return validatedActiveSimulationUpdates;
  });

  readonly simulationEnvironmentSignal: Signal<SimulationEnvironment> =
    computed(() => {
      const validatedActiveSimulationUpdates =
        this.validatedActiveSimulationUpdatesSignal();

      const simulationEnvironment: SimulationEnvironment = {
        passengers: {},
        vehicles: {},
      };

      for (const update of validatedActiveSimulationUpdates) {
        switch (update.type) {
          case 'createPassenger':
            {
              const passenger = update.data as Passenger;
              simulationEnvironment.passengers[passenger.id] = passenger;
            }
            break;
          case 'updatePassengerStatus':
            {
              const passengerStatusUpdate =
                update.data as PassengerStatusUpdate;
              const passenger =
                simulationEnvironment.passengers[passengerStatusUpdate.id];
              if (!passenger) {
                console.error(
                  'Passenger not found: ',
                  passengerStatusUpdate.id,
                );
                break;
              }
              passenger.status = passengerStatusUpdate.status;
            }
            break;
          case 'createVehicle':
            {
              const vehicle = update.data as Vehicle;
              simulationEnvironment.vehicles[vehicle.id] = vehicle;
            }
            break;

          case 'updateVehicleStatus':
            {
              const vehicleStatusUpdate = update.data as VehicleStatusUpdate;
              const vehicle =
                simulationEnvironment.vehicles[vehicleStatusUpdate.id];
              if (!vehicle) {
                console.error('Vehicle not found: ', vehicleStatusUpdate.id);
                break;
              }
              vehicle.status = vehicleStatusUpdate.status;
            }
            break;
          case 'updateVehiclePosition':
            {
              const vehiclePositionUpdate =
                update.data as VehiclePositionUpdate;
              const vehicle =
                simulationEnvironment.vehicles[vehiclePositionUpdate.id];
              if (!vehicle) {
                console.error('Vehicle not found: ', vehiclePositionUpdate.id);
                break;
              }
              vehicle.latitude = vehiclePositionUpdate.latitude;
              vehicle.longitude = vehiclePositionUpdate.longitude;
            }
            break;
        }
      }

      return simulationEnvironment;
    });

  private activeSimulationId: string | null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly communicationService: CommunicationService,
  ) {
    effect(() => {
      const activeSimulationId = this._activeSimulationIdSignal();
      if (activeSimulationId) {
        this.communicationService.on(
          'simulationUpdate' + activeSimulationId,
          (update) => {
            const simulationUpdate = this.extractSimulationUpdate(
              update as AnySimulationUpdate,
            );
            if (simulationUpdate) {
              this.activeSimulationUpdatesSignal.update((updates) => [
                ...updates,
                simulationUpdate,
              ]);
            }
          },
        );

        this.activeSimulationId = activeSimulationId;
      } else if (this.activeSimulationId) {
        this.communicationService.removeAllListeners(
          'simulationUpdate' + this.activeSimulationId,
        );
        this.activeSimulationId = null;
      }
    });
  }

  setActiveSimulationId(simulationId: string) {
    this._activeSimulationIdSignal.set(simulationId);
  }

  unsetActiveSimulationId() {
    this._activeSimulationIdSignal.set(null);
    this.activeSimulationUpdatesSignal.set([]);
  }

  get activeSimulationSignal(): Signal<Simulation | null> {
    return computed(() => {
      const activeSimulationId = this._activeSimulationIdSignal();
      if (!activeSimulationId) {
        return null;
      }

      const simulations = this.dataService.simulationsSignal();

      const currentSimulation = simulations.find(
        (simulation) => simulation.id === activeSimulationId,
      );

      return currentSimulation ?? null;
    });
  }

  /**
   * Validate and extract simulation update from the raw data.
   */
  private extractSimulationUpdate(
    simulationUpdate: AnySimulationUpdate,
  ): AnySimulationUpdate | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting simulation update: ', simulationUpdate);

    const type = simulationUpdate.type;

    if (!type) {
      console.error('Simulation update type not found: ', type);
      return null;
    }
    if (!SIMULATION_UPDATE_TYPES.includes(type)) {
      console.error('Simulation update type not recognized: ', type);
      return null;
    }

    const order = simulationUpdate.order;
    if (order === undefined) {
      console.error('Simulation update order not found: ', order);
      return null;
    }

    const timestamp = simulationUpdate.timestamp;
    if (timestamp === undefined) {
      console.error('Simulation update timestamp not found: ', timestamp);
      return null;
    }

    const data = simulationUpdate.data;
    switch (type) {
      case 'createPassenger':
        {
          const passenger = this.extractPassenger(data as Passenger);
          if (passenger) {
            return { type, order, timestamp, data: passenger };
          }
        }
        return null;

      case 'updatePassengerStatus':
        {
          const passengerStatusUpdate = this.extractPassengerStatusUpdate(
            data as PassengerStatusUpdate,
          );
          if (passengerStatusUpdate) {
            return { type, order, timestamp, data: passengerStatusUpdate };
          }
        }
        return null;

      case 'createVehicle':
        {
          const vehicle = this.extractVehicle(data as Vehicle);
          if (vehicle) {
            return { type, order, timestamp, data: vehicle };
          }
        }
        return null;

      case 'updateVehicleStatus':
        {
          const vehicleStatusUpdate = this.extractVehicleStatusUpdate(
            data as VehicleStatusUpdate,
          );
          if (vehicleStatusUpdate) {
            return { type, order, timestamp, data: vehicleStatusUpdate };
          }
        }
        return null;

      case 'updateVehiclePosition':
        {
          const vehiclePositionUpdate = this.extractVehiclePositionUpdate(
            data as VehiclePositionUpdate,
          );
          if (vehiclePositionUpdate) {
            return { type, order, timestamp, data: vehiclePositionUpdate };
          }
        }
        return null;

      default:
        return null;
    }
  }

  private extractPassenger(data: Passenger): Passenger | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting passenger: ', data);

    const id = data.id;
    if (!id) {
      console.error('Passenger ID not found: ', id);
      return null;
    }

    const name = data.name;
    if (!name) {
      console.error('Passenger name not found: ', name);
      return null;
    }

    const status = data.status;
    if (!status) {
      console.error('Passenger status not found: ', status);
      return null;
    }
    if (!PASSENGER_STATUSES.includes(status)) {
      console.error('Passenger status not recognized: ', status);
      return null;
    }

    return { id, name, status };
  }

  private extractPassengerStatusUpdate(
    data: PassengerStatusUpdate,
  ): PassengerStatusUpdate | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting passenger status update: ', data);

    const id = data.id;
    if (!id) {
      console.error('Passenger ID not found: ', id);
      return null;
    }

    const status = data.status;
    if (!status) {
      console.error('Passenger status not found: ', status);
      return null;
    }
    if (!PASSENGER_STATUSES.includes(status)) {
      console.error('Passenger status not recognized: ', status);
      return null;
    }

    return { id, status };
  }

  private extractVehicle(data: Vehicle): Vehicle | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting vehicle: ', data);

    const id = data.id;
    if (!id) {
      console.error('Vehicle ID not found: ', id);
      return null;
    }

    const mode = data.mode;
    if (!mode) {
      console.error('Vehicle mode not found: ', mode);
      return null;
    }

    const status = data.status;
    if (!status) {
      console.error('Vehicle status not found: ', status);
      return null;
    }
    if (!VEHICLE_STATUSES.includes(status)) {
      console.error('Vehicle status not recognized: ', status);
      return null;
    }

    const latitude = data.latitude ?? null;

    const longitude = data.longitude ?? null;

    return { id, mode, status, latitude, longitude };
  }

  private extractVehicleStatusUpdate(
    data: VehicleStatusUpdate,
  ): VehicleStatusUpdate | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting vehicle status update: ', data);

    const id = data.id;
    if (!id) {
      console.error('Vehicle ID not found: ', id);
      return null;
    }

    const status = data.status;
    if (!status) {
      console.error('Vehicle status not found: ', status);
      return null;
    }
    if (!VEHICLE_STATUSES.includes(status)) {
      console.error('Vehicle status not recognized: ', status);
      return null;
    }

    return { id, status };
  }

  private extractVehiclePositionUpdate(
    data: VehiclePositionUpdate,
  ): VehiclePositionUpdate | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting vehicle position update: ', data);

    const id = data.id;
    if (!id) {
      console.error('Vehicle ID not found: ', id);
      return null;
    }

    const latitude = data.latitude;
    if (latitude === undefined) {
      console.error('Vehicle latitude not found: ', latitude);
      return null;
    }

    const longitude = data.longitude;
    if (longitude === undefined) {
      console.error('Vehicle longitude not found: ', longitude);
      return null;
    }

    return { id, latitude, longitude };
  }
}

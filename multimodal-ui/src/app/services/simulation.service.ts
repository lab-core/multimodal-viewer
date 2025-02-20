import {
  computed,
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
  RawSimulationEnvironment,
  Simulation,
  SIMULATION_UPDATE_TYPES,
  SimulationEnvironment,
  SimulationState,
  STATE_SAVE_STEP,
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
  // MARK: Properties
  private readonly _activeSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _simulationStatesSignal: WritableSignal<SimulationState[]> =
    signal([]);

  // MARK: Constructor
  constructor(
    private readonly dataService: DataService,
    private readonly communicationService: CommunicationService,
  ) {}

  // MARK: Active simulation
  setActiveSimulationId(simulationId: string) {
    this.unsetActiveSimulationId();

    this._activeSimulationIdSignal.set(simulationId);

    this.communicationService.on(
      'missing-simulation-states',
      (rawMissingStates, rawMissingUpdates) => {
        this._simulationStatesSignal.update((states) => {
          const missingStates = (rawMissingStates as RawSimulationEnvironment[])
            .map((rawState) => this.extractSimulationEnvironment(rawState))
            .filter((state) => state !== null);
          const missingUpdates = (rawMissingUpdates as AnySimulationUpdate[])
            .map((rawUpdate) => this.extractSimulationUpdate(rawUpdate))
            .filter((update) => update !== null);

          return this.mergeStates(states, missingStates, missingUpdates);
        });
      },
    );
  }

  unsetActiveSimulationId() {
    this._activeSimulationIdSignal.set(null);

    this._simulationStatesSignal.set([]);

    this.communicationService.removeAllListeners('missing-simulation-states');
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

  // MARK: Communication
  pauseSimulation(simulationId: string) {
    this.communicationService.emit('pause-simulation', simulationId);
  }

  resumeSimulation(simulationId: string) {
    this.communicationService.emit('resume-simulation', simulationId);
  }

  stopSimulation(simulationId: string) {
    this.communicationService.emit('stop-simulation', simulationId);
  }

  // MARK: Data extraction
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

    const name = data.name ?? null;

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

    const mode = data.mode ?? null;

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

    const polylines = data.polylines ?? null;
    if (polylines) {
      for (const [_stopId, polyline] of Object.entries(polylines)) {
        if (!polyline.polyline) {
          console.error('Polyline points not found: ', polyline);
          return null;
        }
        if (!Array.isArray(polyline.polyline)) {
          console.error('Polyline points not an array: ', polyline);
          return null;
        }

        if (!polyline.coefficients) {
          console.error('Polyline coefficients not found: ', polyline);
          return null;
        }
        if (!Array.isArray(polyline.coefficients)) {
          console.error('Polyline coefficients not an array: ', polyline);
          return null;
        }

        if (
          polyline.coefficients.length > 0 &&
          polyline.coefficients.length !== polyline.polyline.length - 1
        ) {
          console.error('Polyline coefficients length mismatch: ', polyline);
          return null;
        }

        for (const point of polyline.polyline) {
          if (point.latitude === undefined) {
            console.error('Polyline point latitude not found: ', point);
            return null;
          }
          if (point.longitude === undefined) {
            console.error('Polyline point longitude not found: ', point);
            return null;
          }
        }
      }
    }

    return { id, mode, status, latitude, longitude, polylines };
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

  private extractSimulationEnvironment(
    data: RawSimulationEnvironment,
  ): SimulationEnvironment | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting simulation environment: ', data);

    const passengers: SimulationEnvironment['passengers'] = {};
    for (const passenger of data.passengers) {
      const extractedPassenger = this.extractPassenger(passenger);
      if (!extractedPassenger) {
        console.error('Invalid passenger: ', passenger);
        return null;
      }
      passengers[extractedPassenger.id] = extractedPassenger;
    }

    const vehicles: SimulationEnvironment['vehicles'] = {};
    for (const vehicle of data.vehicles) {
      const extractedVehicle = this.extractVehicle(vehicle);
      if (!extractedVehicle) {
        console.error('Invalid vehicle: ', vehicle);
        return null;
      }
      vehicles[extractedVehicle.id] = extractedVehicle;
    }

    const timestamp = data.timestamp;
    if (timestamp === undefined) {
      console.error('Simulation environment timestamp not found: ', timestamp);
      return null;
    }

    const order = data.order;
    if (order === undefined) {
      console.error('Simulation environment order not found: ', order);
      return null;
    }

    return { passengers, vehicles, timestamp, order };
  }

  // MARK: Build environment
  get simulationStatesSignal(): Signal<SimulationState[]> {
    return this._simulationStatesSignal;
  }

  /**
   * Apply an update to the simulation environment in place.
   */
  applyUpdate(
    update: AnySimulationUpdate,
    simulationEnvironment: SimulationEnvironment,
  ) {
    simulationEnvironment.order = update.order;
    simulationEnvironment.timestamp = update.timestamp;

    switch (update.type) {
      case 'createPassenger':
        {
          const passenger = update.data as Passenger;
          simulationEnvironment.passengers[passenger.id] = passenger;
        }
        break;
      case 'updatePassengerStatus':
        {
          const passengerStatusUpdate = update.data as PassengerStatusUpdate;
          const passenger =
            simulationEnvironment.passengers[passengerStatusUpdate.id];
          if (!passenger) {
            console.error('Passenger not found: ', passengerStatusUpdate.id);
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
          const vehiclePositionUpdate = update.data as VehiclePositionUpdate;
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

  private mergeStates(
    states: SimulationState[],
    missingStates: SimulationEnvironment[],
    missingUpdates: AnySimulationUpdate[],
  ): SimulationState[] {
    if (missingStates.length === 0 && missingUpdates.length === 0) {
      return states;
    }

    // Deep copy of the states
    const newStates = structuredClone(states);

    // Add missing states
    for (const missingState of missingStates) {
      const existingState = newStates.find(
        (state) => state.environment.order === missingState.order,
      );

      if (existingState) {
        continue;
      }

      const state: SimulationState = {
        environment: missingState,
        updates: [],
      };

      newStates.push(state);
    }

    // Sort states by order
    const sortedStates = newStates.sort(
      (a, b) => a.environment.order - b.environment.order,
    );

    // Add missing updates to the states
    const sortedMissingUpdates = missingUpdates.sort(
      (a, b) => a.order - b.order,
    );

    let stateIndex = 0;
    for (const missingUpdate of sortedMissingUpdates) {
      const update = missingUpdate;

      while (
        stateIndex < sortedStates.length &&
        sortedStates[stateIndex].environment.order + STATE_SAVE_STEP <
          update.order
      ) {
        stateIndex++;
      }

      if (stateIndex >= sortedStates.length) {
        break;
      }

      const existingUpdate = sortedStates[stateIndex].updates.find(
        (existingUpdate) => existingUpdate.order === update.order,
      );
      if (existingUpdate) {
        continue;
      }

      sortedStates[stateIndex].updates.push(update);
    }

    // Keep only 11 states
    if (sortedStates.length <= 11) {
      return sortedStates;
    }

    if (sortedStates[0].environment.order === missingStates[0].order) {
      return sortedStates.slice(0, 11);
    }

    // Reverse sort and slice
    return sortedStates
      .sort((a, b) => b.environment.order - a.environment.order)
      .slice(0, 11);
  }
}

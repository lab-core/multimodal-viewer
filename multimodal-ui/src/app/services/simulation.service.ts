import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { decode } from 'polyline';
import {
  AnySimulationUpdate,
  Passenger,
  PASSENGER_STATUSES,
  PassengerStatusUpdate,
  Polylines,
  RawPolylines,
  RawSimulationEnvironment,
  RawSimulationState,
  Simulation,
  SIMULATION_UPDATE_TYPES,
  SimulationEnvironment,
  SimulationState,
  SimulationStates,
  Stop,
  Vehicle,
  VEHICLE_STATUSES,
  VehicleStatusUpdate,
  VehicleStopsUpdate,
} from '../interfaces/simulation.model';
import { AnimationService } from './animation.service';
import { CommunicationService } from './communication.service';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root',
})
export class SimulationService {
  // MARK: Properties
  private readonly _activeSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _simulationStatesSignal: WritableSignal<SimulationStates> =
    signal({ states: [], hasFollowingStates: true });

  private readonly _simulationPolylinesSignal: WritableSignal<
    Record<string, Polylines>
  > = signal({});

  private readonly _isFetchingSignal: WritableSignal<boolean> = signal(false);

  // MARK: Constructor
  constructor(
    private readonly dataService: DataService,
    private readonly communicationService: CommunicationService,
    private readonly animationService: AnimationService,
  ) {}

  // MARK: Active simulation
  setActiveSimulationId(simulationId: string) {
    this.unsetActiveSimulationId();

    this._activeSimulationIdSignal.set(simulationId);

    this.communicationService.on(
      'missing-simulation-states',
      (
        rawMissingStates,
        missingUpdates,
        stateOrdersToKeep,
        hasFollowingStates,
      ) => {
        this._simulationStatesSignal.update((states) => {
          const parsedMissingStates = (rawMissingStates as string[]).map(
            (rawState) => JSON.parse(rawState) as RawSimulationState,
          );
          const parsedMissingUpdates = Object.entries(
            missingUpdates as Record<string, string[]>,
          ).reduce(
            (acc, [order, rawUpdates]) => {
              acc[parseInt(order)] = rawUpdates.map(
                (rawUpdate) => JSON.parse(rawUpdate) as AnySimulationUpdate,
              );
              return acc;
            },
            {} as Record<number, AnySimulationUpdate[]>,
          );
          const missingStates = parsedMissingStates
            .map((rawState) =>
              this.extractSimulationState(rawState, parsedMissingUpdates),
            )
            .filter((state) => state !== null);

          // const currentStateOrders = states.states
          //   .map((state) => state.order)
          //   .sort((a, b) => a - b);
          // const missingStateOrders = missingStates
          //   .map((state) => state.order)
          //   .sort((a, b) => a - b);
          // console.log(
          //   currentStateOrders,
          //   missingStateOrders,
          //   stateOrdersToKeep,
          //   hasFollowingStates,
          // );
          return this.mergeStates(
            states.states,
            missingStates,
            stateOrdersToKeep as number[],
            !!hasFollowingStates,
          );
        });

        this._isFetchingSignal.set(false);
      },
    );

    this.communicationService.on(
      `polylines-${simulationId}`,
      (polylinesByVehicleId) => {
        this._simulationPolylinesSignal.set(
          this.extractPolylines(
            polylinesByVehicleId as unknown as Record<string, string>,
          ) ?? {},
        );
      },
    );
  }

  unsetActiveSimulationId() {
    const activeSimulationId = this._activeSimulationIdSignal();

    this._activeSimulationIdSignal.set(null);

    this._simulationStatesSignal.set({
      states: [],
      hasFollowingStates: true,
    });

    this._simulationPolylinesSignal.set({});

    this._isFetchingSignal.set(false);

    this.communicationService.removeAllListeners('missing-simulation-states');

    if (activeSimulationId) {
      this.communicationService.removeAllListeners(
        `polylines-${activeSimulationId}`,
      );
    }
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

  editSimulationConfiguration(simulationId: string, maxTime: number | null) {
    this.communicationService.emit(
      'edit-simulation-configuration',
      simulationId,
      maxTime,
    );
  }

  getMissingSimulationStates(
    simulationId: string,
    visualizationTime: number,
    firstUpdateTime: number,
    lastUpdateTime: number,
    polylinesVersion: number,
  ) {
    this._isFetchingSignal.set(true);

    console.log('Getting missing simulation states: ', {
      simulationId,
      visualizationTime,
      firstUpdateTime,
      lastUpdateTime,
      polylinesVersion,
    });

    this.communicationService.emit(
      'get-missing-simulation-states',
      simulationId,
      visualizationTime,
      firstUpdateTime,
      lastUpdateTime,
      polylinesVersion,
    );
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

      case 'updateVehicleStops':
        {
          const vehicleStopsUpdate = this.extractVehicleStopsUpdate(
            data as VehicleStopsUpdate,
          );
          if (vehicleStopsUpdate) {
            return { type, order, timestamp, data: vehicleStopsUpdate };
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

    if (!Array.isArray(data.previousStops)) {
      console.error('Vehicle previous stops not found: ', data.previousStops);
      return null;
    }

    const previousStops = data.previousStops.map((stop) =>
      this.extractStop(stop),
    );
    if (!previousStops.every((stop) => stop !== null)) {
      console.error('Vehicle previous stops invalid: ', previousStops);
      return null;
    }

    const currentStop =
      data.currentStop !== undefined
        ? this.extractStop(data.currentStop!)
        : null;
    if (data.currentStop !== undefined && currentStop === null) {
      console.error('Vehicle current stop invalid: ', data.currentStop);
      return null;
    }

    if (!Array.isArray(data.nextStops)) {
      console.error('Vehicle next stops not found: ', data.nextStops);
      return null;
    }

    const nextStops = data.nextStops.map((stop) => this.extractStop(stop));
    if (!nextStops.every((stop) => stop !== null)) {
      console.error('Vehicle next stops invalid: ', nextStops);
      return null;
    }

    return {
      id,
      mode,
      status,
      latitude,
      longitude,
      polylines: null,
      previousStops,
      currentStop,
      nextStops,
    };
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

  private extractVehicleStopsUpdate(
    data: VehicleStopsUpdate,
  ): VehicleStopsUpdate | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting vehicle stops update: ', data);

    const id = data.id;
    if (!id) {
      console.error('Vehicle ID not found: ', id);
      return null;
    }

    if (!Array.isArray(data.previousStops)) {
      console.error('Vehicle previous stops not found: ', data.previousStops);
      return null;
    }

    const previousStops = data.previousStops.map((stop) =>
      this.extractStop(stop),
    );
    if (!previousStops.every((stop) => stop !== null)) {
      console.error('Vehicle previous stops invalid: ', previousStops);
      return null;
    }

    const currentStop =
      data.currentStop !== undefined
        ? this.extractStop(data.currentStop!)
        : null;
    if (data.currentStop !== undefined && currentStop === null) {
      console.error('Vehicle current stop invalid: ', data.currentStop);
      return null;
    }

    if (!Array.isArray(data.nextStops)) {
      console.error('Vehicle next stops not found: ', data.nextStops);
      return null;
    }

    const nextStops = data.nextStops.map((stop) => this.extractStop(stop));
    if (!nextStops.every((stop) => stop !== null)) {
      console.error('Vehicle next stops invalid: ', nextStops);
      return null;
    }

    return { id, previousStops, currentStop, nextStops };
  }

  private extractStop(data: Stop): Stop | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting stop: ', data);

    const arrivalTime = data.arrivalTime;
    if (arrivalTime === undefined) {
      console.error('Stop arrival time not found: ', arrivalTime);
      return null;
    }

    const departureTime = data.departureTime ?? null;

    return { arrivalTime, departureTime };
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

  private extractSimulationState(
    rawSimulationState: RawSimulationState,
    allUpdates: Record<number, AnySimulationUpdate[]>,
  ): SimulationState | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting simulation state: ', rawSimulationState);

    const environment = this.extractSimulationEnvironment(rawSimulationState);
    if (!environment) {
      console.error('Invalid simulation environment: ', rawSimulationState);
      return null;
    }

    const rawUpdates = allUpdates[environment.order];
    if (!Array.isArray(rawUpdates)) {
      console.error('Simulation state updates not found: ', rawUpdates);
      return null;
    }

    const updates: AnySimulationUpdate[] = [];

    for (const rawUpdate of rawUpdates) {
      const update = this.extractSimulationUpdate(rawUpdate);

      if (update) {
        updates.push(update);
      } else {
        console.error('Invalid simulation update: ', rawUpdate);
        return null;
      }
    }

    return { ...environment, updates };
  }

  private extractPolylines(
    rawPolylinesByVehicleId: Record<string, string>,
  ): Record<string, Polylines> | null {
    const parsedPolylinesByVehicleId = Object.entries(
      rawPolylinesByVehicleId,
    ).reduce(
      (acc, [vehicleId, rawPolylines]) => {
        acc[vehicleId] = JSON.parse(rawPolylines) as RawPolylines;
        return acc;
      },
      {} as Record<string, RawPolylines>,
    );

    if (!parsedPolylinesByVehicleId) {
      console.error('Polylines not found: ', parsedPolylinesByVehicleId);
      return null;
    }

    if (Object.keys(parsedPolylinesByVehicleId).length === 0) {
      return {};
    }

    const polylinesByVehicleId: Record<string, Polylines> = {};

    for (const [vehicleId, rawPolylines] of Object.entries(
      parsedPolylinesByVehicleId,
    )) {
      const polylines: Polylines = {};

      if (!rawPolylines) {
        console.error('Polylines not found: ', rawPolylines);
        return null;
      }

      if (Object.keys(rawPolylines).length === 0) {
        polylinesByVehicleId[vehicleId] = polylines;
        continue;
      }

      for (const [stopId, rawPolyline] of Object.entries(rawPolylines)) {
        if (!rawPolyline) {
          console.error('Polyline not found: ', rawPolyline);
          return null;
        }

        if (!Array.isArray(rawPolyline) || rawPolyline.length !== 2) {
          console.error('Invalid polyline: ', rawPolyline);
          return null;
        }

        const [encodedPolyline, coefficients] = rawPolyline;

        const decodedPolyline = decode(encodedPolyline).map((point) => ({
          latitude: point[0],
          longitude: point[1],
        }));

        if (
          decodedPolyline.length > 1 &&
          coefficients.length !== decodedPolyline.length - 1
        ) {
          if (coefficients.length === 1 && coefficients[0] === 1) {
            // The simulation was unable to calculate the coefficients, but
            // we can still make the vehicle move at a constant speed.
            const distances = [];

            for (let index = 0; index < decodedPolyline.length - 1; index++) {
              const point1 = decodedPolyline[index];
              const point2 = decodedPolyline[index + 1];

              const distance = Math.sqrt(
                (point2.latitude - point1.latitude) ** 2 +
                  (point2.longitude - point1.longitude) ** 2,
              );

              distances.push(distance);
            }

            const totalDistance = distances.reduce((a, b) => a + b, 0);

            if (totalDistance === 0) {
              console.error('Total distance is zero: ', decodedPolyline);
              return null;
            }

            coefficients.splice(
              0,
              coefficients.length,
              ...distances.map((distance) => distance / totalDistance),
            );
          } else {
            console.error(
              'Polyline coefficients length mismatch: ',
              decodedPolyline,
              coefficients,
            );
            return null;
          }
        }

        polylines[stopId] = { polyline: decodedPolyline, coefficients };
      }

      polylinesByVehicleId[vehicleId] = polylines;
    }

    return polylinesByVehicleId;
  }

  // MARK: Build environment
  get simulationStatesSignal(): Signal<SimulationStates> {
    return this._simulationStatesSignal;
  }

  get simulationPolylinesSignal(): Signal<Record<string, Polylines>> {
    return this._simulationPolylinesSignal;
  }

  get isFetchingSignal(): Signal<boolean> {
    return this._isFetchingSignal;
  }

  /**
   * Apply an update to the simulation environment in place.
   */
  buildEnvironment(
    state: SimulationState,
    polylinesByVehicleId: Record<string, Polylines>,
    visualizationTime: number,
  ): SimulationEnvironment {
    const start = Date.now();
    const clonedState = structuredClone(state);
    const end = Date.now();
    console.log('Cloning time: ', end - start);

    const sortedUpdates = clonedState.updates.sort((a, b) => a.order - b.order);

    let lastUpdate: AnySimulationUpdate | null = null;

    for (const update of sortedUpdates) {
      if (update.timestamp > visualizationTime) {
        break;
      }

      this.applyUpdate(update, clonedState);

      lastUpdate = update;
    }

    for (const [vehicleId, vehicle] of Object.entries(clonedState.vehicles)) {
      const polylines = polylinesByVehicleId[vehicleId];
      if (!polylines) {
        console.error('Polyline not found for vehicle: ', vehicleId, polylines);
        continue;
      }

      vehicle.polylines = polylines;
    }

    if (lastUpdate) {
      clonedState.order = lastUpdate.order;
      clonedState.timestamp = lastUpdate.timestamp;
    }

    return clonedState;
  }

  private applyUpdate(
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

      case 'updateVehicleStops':
        {
          const vehicleStopsUpdate = update.data as VehicleStopsUpdate;
          const vehicle = simulationEnvironment.vehicles[vehicleStopsUpdate.id];
          if (!vehicle) {
            console.error('Vehicle not found: ', vehicleStopsUpdate.id);
            break;
          }

          vehicle.previousStops = vehicleStopsUpdate.previousStops;
          vehicle.currentStop = vehicleStopsUpdate.currentStop;
          vehicle.nextStops = vehicleStopsUpdate.nextStops;
        }
        break;
    }
  }

  private mergeStates(
    states: SimulationState[],
    missingStates: SimulationState[],
    stateOrdersToKeep: number[],
    hasFollowingStates: boolean,
  ): SimulationStates {
    for (const state of states) {
      if (stateOrdersToKeep.includes(state.order)) {
        missingStates.push(state);
      }
    }

    return {
      states: missingStates.sort((a, b) => a.order - b.order),
      hasFollowingStates,
    };
  }
}

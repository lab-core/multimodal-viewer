import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import randomName from 'node-random-name';
import { decode } from 'polyline';
import {
  AllPolylines,
  AnimatedSimulationState,
  AnimatedSimulationStates,
  AnimationData,
  AnyPassengerAnimationData,
  AnySimulationUpdate,
  AnyVehicleAnimationData,
  DEFAULT_STOP_CAPACITY,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  getAllStops,
  getStopId,
  Leg,
  Passenger,
  PASSENGER_STATUSES,
  PassengerAnimationData,
  PassengerLegsUpdate,
  PassengerStatusUpdate,
  Polyline,
  RawSimulationEnvironment,
  RawSimulationState,
  Simulation,
  SIMULATION_UPDATE_TYPES,
  SimulationEnvironment,
  SimulationState,
  SimulationUpdate,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  StatisticUpdate,
  Stop,
  Vehicle,
  VEHICLE_STATUSES,
  VehicleAnimationData,
  VehicleStatusUpdate,
  VehicleStopsUpdate,
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

  private readonly _simulationStatesSignal: WritableSignal<AnimatedSimulationStates> =
    signal({
      states: [],
      shouldRequestMoreStates: true,
      firstContinuousState: null,
      lastContinuousState: null,
      currentState: null,
      continuousAnimationData: null,
    });

  private readonly _simulationPolylinesSignal: WritableSignal<AllPolylines | null> =
    signal(null);

  private readonly _isFetchingStatesSignal: WritableSignal<boolean> =
    signal(false);
  private readonly _isFetchingPolylinesSignal: WritableSignal<boolean> =
    signal(false);

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
      (
        rawMissingStates,
        rawMissingUpdates,
        stateOrdersToKeep,
        shouldRequestMoreStates,
        firstContinuousStateOrder,
        lastContinuousStateOrder,
        currentStateOrder,
      ) => {
        this._simulationStatesSignal.update((states) => {
          const parsedMissingStates = (rawMissingStates as string[]).map(
            (rawState) => JSON.parse(rawState) as RawSimulationState,
          );
          const parsedMissingUpdates = Object.entries(
            rawMissingUpdates as Record<string, string[]>,
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

          return this.mergeStates(
            states,
            missingStates,
            stateOrdersToKeep as number[],
            !!shouldRequestMoreStates,
            firstContinuousStateOrder as number,
            lastContinuousStateOrder as number,
            currentStateOrder as number,
          );
        });

        this._isFetchingStatesSignal.set(false);
      },
    );

    this.communicationService.on(
      `polylines-${simulationId}`,
      (polylinesByCoordinates, version) => {
        this._isFetchingPolylinesSignal.set(false);

        this._simulationPolylinesSignal.set(
          this.extractPolylines(
            polylinesByCoordinates as unknown as string[],
            version as number,
          ) ?? null,
        );
      },
    );
  }

  unsetActiveSimulationId() {
    const activeSimulationId = this._activeSimulationIdSignal();

    this._activeSimulationIdSignal.set(null);

    this._simulationStatesSignal.set({
      states: [],
      shouldRequestMoreStates: true,
      firstContinuousState: null,
      lastContinuousState: null,
      currentState: null,
      continuousAnimationData: null,
    });

    this._simulationPolylinesSignal.set(null);

    this._isFetchingStatesSignal.set(false);
    this._isFetchingPolylinesSignal.set(false);

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

  editSimulationConfiguration(
    simulationId: string,
    maxDuration: number | null,
  ) {
    this.communicationService.emit(
      'edit-simulation-configuration',
      simulationId,
      maxDuration,
    );
  }

  getMissingSimulationStates(
    simulationId: string,
    visualizationTime: number,
    allStateOrders: number[],
  ) {
    this._isFetchingStatesSignal.set(true);

    this.communicationService.emit(
      'get-missing-simulation-states',
      simulationId,
      visualizationTime,
      allStateOrders,
    );
  }

  getPolylines(simulationId: string) {
    this._isFetchingPolylinesSignal.set(true);

    this.communicationService.emit('get-polylines', simulationId);
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
      case 'updatePassengerLegs':
        {
          const passengerLegsUpdate = this.extractPassengerLegsUpdate(
            data as PassengerLegsUpdate,
          );
          if (passengerLegsUpdate) {
            return { type, order, timestamp, data: passengerLegsUpdate };
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

      case 'updateStatistic': {
        return {
          type,
          order,
          timestamp,
          data: data as StatisticUpdate,
        };
      }

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

    let name = data.name ?? null;

    if (name === id || name === null) {
      name = (randomName as (args?: { seed: string }) => string)({ seed: id });
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

    const numberOfPassengers = data.numberOfPassengers;
    if (numberOfPassengers === undefined) {
      console.error(
        'Passenger number of passengers not found: ',
        numberOfPassengers,
      );
      return null;
    }

    if (!Array.isArray(data.previousLegs)) {
      console.error('Passenger previous legs not found: ', data.previousLegs);
      return null;
    }

    const previousLegs = data.previousLegs.map((leg) => this.extractLeg(leg));
    if (!previousLegs.every((leg) => leg !== null)) {
      console.error('Passenger previous legs invalid: ', previousLegs);
      return null;
    }

    if (!Array.isArray(data.nextLegs)) {
      console.error('Passenger next legs not found: ', data.nextLegs);
      return null;
    }

    const currentLeg =
      data.currentLeg !== undefined ? this.extractLeg(data.currentLeg!) : null;
    if (data.currentLeg !== undefined && currentLeg === null) {
      console.error('Passenger current leg invalid: ', data.currentLeg);
      return null;
    }

    const nextLegs = data.nextLegs.map((leg) => this.extractLeg(leg));
    if (!nextLegs.every((leg) => leg !== null)) {
      console.error('Passenger next legs invalid: ', nextLegs);
      return null;
    }

    return {
      entityType: 'passenger',
      id,
      name,
      status,
      previousLegs,
      currentLeg,
      nextLegs,
      numberOfPassengers,
    };
  }

  private extractLeg(data: Leg): Leg | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting leg: ', data);

    const assignedVehicleId = data.assignedVehicleId ?? null;

    const boardingStopIndex = data.boardingStopIndex ?? null;

    const alightingStopIndex = data.alightingStopIndex ?? null;

    const boardingTime = data.boardingTime ?? null;

    const alightingTime = data.alightingTime ?? null;

    const assignedTime = data.assignedTime ?? null;

    return {
      assignedVehicleId,
      boardingStopIndex,
      alightingStopIndex,
      boardingTime,
      alightingTime,
      assignedTime,
    };
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

  private extractPassengerLegsUpdate(
    data: PassengerLegsUpdate,
  ): PassengerLegsUpdate | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting passenger legs update: ', data);

    const id = data.id;
    if (!id) {
      console.error('Passenger ID not found: ', id);
      return null;
    }

    if (!Array.isArray(data.previousLegs)) {
      console.error('Passenger previous legs not found: ', data.previousLegs);
      return null;
    }

    const previousLegs = data.previousLegs.map((leg) => this.extractLeg(leg));
    if (!previousLegs.every((leg) => leg !== null)) {
      console.error('Passenger previous legs invalid: ', previousLegs);
      return null;
    }

    const currentLeg =
      data.currentLeg !== undefined ? this.extractLeg(data.currentLeg!) : null;
    if (data.currentLeg !== undefined && currentLeg === null) {
      console.error('Passenger current leg invalid: ', data.currentLeg);
      return null;
    }

    if (!Array.isArray(data.nextLegs)) {
      console.error('Passenger next legs not found: ', data.nextLegs);
      return null;
    }

    const nextLegs = data.nextLegs.map((leg) => this.extractLeg(leg));
    if (!nextLegs.every((leg) => leg !== null)) {
      console.error('Passenger next legs invalid: ', nextLegs);
      return null;
    }

    return { id, previousLegs, currentLeg, nextLegs };
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

    const capacity = data.capacity;
    if (capacity === undefined) {
      console.error('Vehicle capacity not found: ', capacity);
      return null;
    }

    const name = data.name;
    if (name === undefined) {
      console.error('Vehicle name not found: ', name);
      return null;
    }

    return {
      entityType: 'vehicle',
      id,
      mode,
      status,
      previousStops,
      currentStop,
      nextStops,
      capacity,
      name,
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

    const position = data.position;

    if (
      position === undefined ||
      position.latitude === undefined ||
      position.longitude === undefined
    ) {
      console.error('Stop position invalid: ', position);
      return null;
    }

    const id = getStopId(position);

    const capacity = data.capacity ?? DEFAULT_STOP_CAPACITY;

    const label = data.label;

    if (label === undefined) {
      console.error('Stop label not found: ', label);
      return null;
    }
    if (typeof label !== 'string') {
      console.error('Invalid stop label: ', label);
      return null;
    }

    return {
      id,
      entityType: 'stop',
      arrivalTime,
      departureTime,
      position,
      capacity,
      label,
    };
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

    const statistic = data.statistic;
    if (timestamp === undefined) {
      console.error('Simulation statistic not found: ', timestamp);
      return null;
    }

    const order = data.order;
    if (order === undefined) {
      console.error('Simulation environment order not found: ', order);
      return null;
    }

    return { passengers, vehicles, timestamp, statistic, order };
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
    polylinesByCoordinates: string[],
    version: number,
  ): AllPolylines | null {
    if (!Array.isArray(polylinesByCoordinates)) {
      console.error('Polylines not found: ', polylinesByCoordinates);
      return null;
    }

    const parsedPolylinesByCoordinates: Record<string, Polyline> | null =
      polylinesByCoordinates.reduce<Record<string, Polyline> | null>(
        (acc, rawPolyline) => {
          if (acc === null) {
            return null;
          }

          const parsedPolyline: Record<string, unknown> = JSON.parse(
            rawPolyline,
          ) as Record<string, unknown>;

          const coordinatesString: string = parsedPolyline[
            'coordinatesString'
          ] as string;
          if (coordinatesString === undefined) {
            console.error('Coordinates string not found: ', coordinatesString);
            return null;
          }
          if (typeof coordinatesString !== 'string') {
            console.error('Invalid coordinates string: ', coordinatesString);
            return null;
          }

          const coefficients: number[] = parsedPolyline[
            'coefficients'
          ] as number[];
          if (coefficients === undefined) {
            console.error('Coefficients not found: ', coefficients);
            return null;
          }
          if (!Array.isArray(coefficients)) {
            console.error('Invalid coefficients: ', coefficients);
            return null;
          }

          const encodedPolyline: string = parsedPolyline[
            'encodedPolyline'
          ] as string;
          if (encodedPolyline === undefined) {
            console.error(
              'Polyline not found: ',
              encodedPolyline,
              parsedPolyline,
            );
            return null;
          }
          if (typeof encodedPolyline !== 'string') {
            console.error('Invalid polyline: ', encodedPolyline);
            return null;
          }

          const decodedPolyline = decode(encodedPolyline).map((point) => ({
            latitude: point[0],
            longitude: point[1],
          }));

          if (!Array.isArray(decodedPolyline)) {
            console.error('Decoded polyline not found: ', decodedPolyline);
            return null;
          }

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

          acc[coordinatesString] = { polyline: decodedPolyline, coefficients };

          return acc;
        },
        {} as Record<string, Polyline>,
      );

    if (parsedPolylinesByCoordinates === null) {
      return null;
    }

    if (typeof version !== 'number') {
      console.error('Polylines version not found: ', version);
      return null;
    }
    return { version, polylinesByCoordinates: parsedPolylinesByCoordinates };
  }

  // MARK: Build environment
  get simulationStatesSignal(): Signal<AnimatedSimulationStates> {
    return this._simulationStatesSignal;
  }

  get simulationPolylinesSignal(): Signal<AllPolylines | null> {
    return this._simulationPolylinesSignal;
  }

  get isFetchingStatesSignal(): Signal<boolean> {
    return this._isFetchingStatesSignal;
  }

  get isFetchingPolylinesSignal(): Signal<boolean> {
    return this._isFetchingPolylinesSignal;
  }

  /**
   * Apply an update to the simulation environment in place.
   */
  buildEnvironment(
    state: SimulationState,
    visualizationTime: number,
  ): SimulationEnvironment {
    let lastUpdate: AnySimulationUpdate | null = null;

    for (const update of state.updates) {
      if (update.timestamp > visualizationTime) {
        break;
      }

      this.applyUpdate(update, state);

      lastUpdate = update;
    }

    if (lastUpdate) {
      state.order = lastUpdate.order;
      state.timestamp = lastUpdate.timestamp;
    }

    return state;
  }

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
          simulationEnvironment.passengers[passengerStatusUpdate.id] = {
            ...passenger,
            status: passengerStatusUpdate.status,
          };
        }
        break;
      case 'updatePassengerLegs':
        {
          const passengerLegsUpdate = update.data as PassengerLegsUpdate;
          const passenger =
            simulationEnvironment.passengers[passengerLegsUpdate.id];
          if (!passenger) {
            console.error('Passenger not found: ', passengerLegsUpdate.id);
            break;
          }

          simulationEnvironment.passengers[passengerLegsUpdate.id] = {
            ...passenger,
            previousLegs: passengerLegsUpdate.previousLegs,
            currentLeg: passengerLegsUpdate.currentLeg,
            nextLegs: passengerLegsUpdate.nextLegs,
          };
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

          simulationEnvironment.vehicles[vehicleStatusUpdate.id] = {
            ...vehicle,
            status: vehicleStatusUpdate.status,
          };
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

          simulationEnvironment.vehicles[vehicleStopsUpdate.id] = {
            ...vehicle,
            previousStops: vehicleStopsUpdate.previousStops,
            currentStop: vehicleStopsUpdate.currentStop,
            nextStops: vehicleStopsUpdate.nextStops,
          };
        }
        break;
      case 'updateStatistic':
        {
          simulationEnvironment.statistic = (
            update.data as StatisticUpdate
          ).statistic;
        }
        break;
    }
  }

  private mergeStates(
    states: AnimatedSimulationStates,
    missingStates: SimulationState[],
    stateOrdersToKeep: number[],
    shouldRequestMoreStates: boolean,
    firstContinuousStateOrder: number,
    lastContinuousStateOrder: number,
    currentStateOrder: number,
  ): AnimatedSimulationStates {
    const animatedMissingStates: AnimatedSimulationState[] = missingStates.map(
      (state) => {
        const shallowCopy = {
          ...state,
          vehicles: {
            ...state.vehicles,
          },
          passengers: {
            ...state.passengers,
          },
        };

        const animationData = this.getAnimationData(
          shallowCopy,
          this._simulationPolylinesSignal()?.polylinesByCoordinates ?? null,
        );

        return {
          ...state,
          animationData,
        };
      },
    );

    for (const state of states.states) {
      if (stateOrdersToKeep.includes(state.order)) {
        animatedMissingStates.push(state);
      }
    }

    const sortedStates = animatedMissingStates.sort(
      (a, b) => a.order - b.order,
    );

    const firstStateIndex = sortedStates.findIndex(
      (state) => state.order === firstContinuousStateOrder,
    );
    const lastStateIndex = sortedStates.findIndex(
      (state) => state.order === lastContinuousStateOrder,
    );

    const currentStateIndex = sortedStates.findIndex(
      (state) => state.order === currentStateOrder,
    );

    const defaultReturnValue = {
      states: sortedStates,
      shouldRequestMoreStates,
      firstContinuousState: null,
      lastContinuousState: null,
      currentState: null,
      continuousAnimationData: null,
    };

    if (firstStateIndex === -1) {
      console.error(
        'First continuous state not found: ',
        firstContinuousStateOrder,
      );
      return defaultReturnValue;
    }
    if (lastStateIndex === -1) {
      console.error(
        'Last continuous state not found: ',
        lastContinuousStateOrder,
      );
      return defaultReturnValue;
    }
    if (currentStateIndex === -1) {
      console.error('Current state not found: ', currentStateOrder);
      return defaultReturnValue;
    }
    if (
      currentStateIndex > lastStateIndex ||
      currentStateIndex < firstStateIndex
    ) {
      console.error(
        'Current state out of bounds: ',
        currentStateIndex,
        firstStateIndex,
        lastStateIndex,
      );
      return defaultReturnValue;
    }

    const firstState = sortedStates[firstStateIndex];
    const lastState = sortedStates[lastStateIndex];

    const firstContinuousState = {
      timestamp: firstState.timestamp,
      order: firstState.order,
      index: firstStateIndex,
    };

    const lastContinuousUpdate =
      lastState.updates[lastState.updates.length - 1];

    const lastContinuousState = {
      timestamp: lastContinuousUpdate?.timestamp ?? lastState.timestamp,
      order: lastContinuousUpdate?.order ?? lastState.order,
      index: lastStateIndex,
    };

    const currentState = sortedStates[currentStateIndex];

    const startTimestamp = currentState.timestamp;

    let endTimestamp: number;
    if (currentStateIndex + 1 <= lastStateIndex) {
      endTimestamp = sortedStates[currentStateIndex + 1].timestamp;
    } else {
      endTimestamp = lastContinuousUpdate?.timestamp ?? currentState.timestamp;
    }

    const continuousStates = sortedStates.slice(
      firstContinuousState.index,
      lastContinuousState.index + 1,
    );

    const continuousAnimationData = continuousStates.reduce((acc, state) => {
      return this.mergeAnimationData(acc, state.animationData, state.timestamp);
    }, continuousStates[0].animationData);

    return {
      states: sortedStates,
      shouldRequestMoreStates,
      firstContinuousState,
      lastContinuousState,
      currentState: {
        startTimestamp,
        endTimestamp,
      },
      continuousAnimationData,
    };
  }

  private getAnimationData(
    state: SimulationState,
    polylines: Record<string, Polyline> | null,
  ): AnimationData {
    const animatedSimulationState = this.createInitialAnimationData(
      state,
      polylines,
    );

    for (const update of state.updates) {
      this.applyUpdate(update, animatedSimulationState);
      animatedSimulationState.animationData.endOrder = update.order;
      animatedSimulationState.animationData.endTimestamp = update.timestamp;

      switch (update.type) {
        case 'createPassenger':
          {
            const castedUpdate = update as SimulationUpdate<'createPassenger'>;
            this.handleCreatePassenger(animatedSimulationState, castedUpdate);
          }
          break;
        case 'updatePassengerStatus':
          {
            const castedUpdate =
              update as SimulationUpdate<'updatePassengerStatus'>;
            this.handleUpdatePassengerStatus(
              animatedSimulationState,
              castedUpdate,
            );
          }
          break;
        case 'updatePassengerLegs':
          {
            const castedUpdate =
              update as SimulationUpdate<'updatePassengerLegs'>;
            this.handleUpdatePassengerLegs(
              animatedSimulationState,
              castedUpdate,
            );
          }
          break;
        case 'createVehicle':
          {
            const castedUpdate = update as SimulationUpdate<'createVehicle'>;
            this.handleCreateVehicle(
              animatedSimulationState,
              castedUpdate,
              polylines,
            );
          }
          break;
        case 'updateVehicleStatus':
          {
            const castedUpdate =
              update as SimulationUpdate<'updateVehicleStatus'>;
            this.handleUpdateVehicleStatus(
              animatedSimulationState,
              castedUpdate,
            );
          }
          break;
        case 'updateVehicleStops':
          {
            const castedUpdate =
              update as SimulationUpdate<'updateVehicleStops'>;
            this.handleUpdateVehicleStops(
              animatedSimulationState,
              castedUpdate,
              polylines,
            );
          }
          break;
        case 'updateStatistic':
          // Do nothing
          break;
      }
    }

    this.updateEndTimestamps(animatedSimulationState);

    return animatedSimulationState.animationData;
  }

  private createInitialAnimationData(
    state: SimulationState,
    polylines: Record<string, Polyline> | null,
  ): AnimatedSimulationState {
    const animatedSimulationState: AnimatedSimulationState = {
      ...state,
      animationData: {
        passengers: {},
        vehicles: {},
        startTimestamp: state.timestamp,
        startOrder: state.order,
        endTimestamp: state.timestamp,
        endOrder: state.order,
      },
    };

    for (const vehicle of Object.values(state.vehicles)) {
      animatedSimulationState.animationData.vehicles[vehicle.id] = [
        this.getVehicleAnimationDataFromVehicle(
          vehicle,
          polylines,
          state.timestamp,
          state.order,
        ),
      ];
    }

    for (const passenger of Object.values(state.passengers)) {
      animatedSimulationState.animationData.passengers[passenger.id] = [
        this.getPassengerAnimationDataFromPassenger(
          passenger,
          state.timestamp,
          state.order,
          state.timestamp,
        ),
      ];
    }

    return animatedSimulationState;
  }

  private getPassengerAnimationDataFromPassenger(
    passenger: Passenger,
    startTimestamp: number,
    startOrder: number,
    currentTimestamp: number,
  ): AnyPassengerAnimationData {
    const basicAnimationData: PassengerAnimationData = {
      status: passenger.status,
      startTimestamp,
      startOrder,
      endTimestamp: null,
      endOrder: null,
      vehicleId: null,
      notDisplayedReason: null,
    };

    let leg: Leg | null = null;

    if (passenger.currentLeg !== null) {
      leg = passenger.currentLeg;
    } else if (passenger.nextLegs.length > 0) {
      leg = passenger.nextLegs[0];
    } else if (passenger.previousLegs.length > 0) {
      leg = passenger.previousLegs.slice(-1)[0];
    } else {
      basicAnimationData.notDisplayedReason = 'Passenger has no leg';
      return basicAnimationData;
    }

    if (leg.assignedVehicleId === null || leg.assignedTime === null) {
      basicAnimationData.notDisplayedReason = 'Leg has no assigned vehicle';
      return basicAnimationData;
    } else if (leg.boardingStopIndex === null) {
      basicAnimationData.notDisplayedReason = 'Leg has no boarding stop';
      return basicAnimationData;
    } else if (leg.alightingStopIndex === null) {
      basicAnimationData.notDisplayedReason = 'Leg has no alighting stop';
      return basicAnimationData;
    }

    basicAnimationData.vehicleId = leg.assignedVehicleId;

    // Is at the boarding stop
    if (leg.boardingTime === null || leg.boardingTime > currentTimestamp) {
      const staticAnimationData: StaticPassengerAnimationData = {
        ...basicAnimationData,
        stopIndex: leg.boardingStopIndex,
      };
      return staticAnimationData;
    }

    // Is between boarding and alighting stop
    if (leg.alightingTime === null || leg.alightingTime > currentTimestamp) {
      const dynamicAnimationData: DynamicPassengerAnimationData = {
        ...basicAnimationData,
        isOnBoard: true,
      };

      return dynamicAnimationData;
    }

    // Is at the alighting stop
    const staticAnimationData: StaticPassengerAnimationData = {
      ...basicAnimationData,
      stopIndex: leg.alightingStopIndex,
    };

    return staticAnimationData;
  }

  private getVehicleAnimationDataFromVehicle(
    vehicle: Vehicle,
    polylines: Record<string, Polyline> | null,
    startTimestamp: number,
    startOrder: number,
  ): AnyVehicleAnimationData {
    const basicAnimationData: VehicleAnimationData = {
      status: vehicle.status,
      startTimestamp,
      startOrder,
      endTimestamp: null,
      endOrder: null,
      displayedPolylines: this.getDisplayedPolylines(vehicle, polylines),
      notDisplayedReason: null,
    };

    // Vehicle is static
    if (vehicle.currentStop !== null) {
      const staticAnimationData: StaticVehicleAnimationData = {
        ...basicAnimationData,
        position: vehicle.currentStop.position,
        stopId: vehicle.currentStop.id,
      };

      return staticAnimationData;
    }

    // Vehicle is moving
    if (vehicle.previousStops.length > 0 && vehicle.nextStops.length > 0) {
      const stop = vehicle.previousStops[vehicle.previousStops.length - 1];
      const nextStop = vehicle.nextStops[0];

      const polyline = this.getPolylineForStops(stop, nextStop, polylines);

      if (polyline === null) {
        basicAnimationData.notDisplayedReason =
          'Vehicle has no polyline between previous and next stop';

        return basicAnimationData;
      }

      const dynamicAnimationData: DynamicVehicleAnimationData = {
        ...basicAnimationData,
        polyline: polyline,
      };

      return dynamicAnimationData;
    }

    if (vehicle.previousStops.length > 0 && vehicle.nextStops.length === 0) {
      basicAnimationData.notDisplayedReason = 'Vehicle has no next stop';
    } else if (
      vehicle.previousStops.length === 0 &&
      vehicle.nextStops.length > 0
    ) {
      basicAnimationData.notDisplayedReason = 'Vehicle has no previous stop';
    } else {
      basicAnimationData.notDisplayedReason = 'Vehicle has no stops';
    }

    return basicAnimationData;
  }

  private handleCreatePassenger(
    animatedSimulationState: AnimatedSimulationState,
    update: SimulationUpdate<'createPassenger'>,
  ): void {
    const passenger = update.data;

    animatedSimulationState.animationData.passengers[passenger.id] = [
      this.getPassengerAnimationDataFromPassenger(
        passenger,
        animatedSimulationState.timestamp,
        animatedSimulationState.order,
        animatedSimulationState.timestamp,
      ),
    ];
  }

  private handleUpdatePassengerStatus(
    animatedSimulationState: AnimatedSimulationState,
    update: SimulationUpdate<'updatePassengerStatus'>,
  ): void {
    const passengerId = update.data.id;
    const status = update.data.status;

    const passengerAnimationData =
      animatedSimulationState.animationData.passengers[passengerId];

    if (passengerAnimationData === undefined) {
      console.error(
        'Passenger animation data not found',
        animatedSimulationState,
        update,
      );
      return;
    }

    const lastAnimationData =
      passengerAnimationData[passengerAnimationData.length - 1];

    if (lastAnimationData.startTimestamp === update.timestamp) {
      lastAnimationData.status = status;
    } else {
      lastAnimationData.endTimestamp = update.timestamp;
      lastAnimationData.endOrder = update.order;
      passengerAnimationData.push({
        ...lastAnimationData,
        startTimestamp: update.timestamp,
        startOrder: update.order,
        endTimestamp: null,
        endOrder: null,
        status,
      });
    }
  }

  private handleUpdatePassengerLegs(
    animatedSimulationState: AnimatedSimulationState,
    update: SimulationUpdate<'updatePassengerLegs'>,
  ): void {
    const passengerId = update.data.id;

    const passengerAnimationData =
      animatedSimulationState.animationData.passengers[passengerId];

    if (passengerAnimationData === undefined) {
      console.error(
        'Passenger animation data not found',
        animatedSimulationState,
        update,
      );
      return;
    }

    const passenger = animatedSimulationState.passengers[passengerId];

    const lastAnimationData =
      passengerAnimationData[passengerAnimationData.length - 1];

    const newAnimationData = this.getPassengerAnimationDataFromPassenger(
      passenger,
      update.timestamp,
      update.order,
      animatedSimulationState.timestamp,
    );

    if (lastAnimationData.startTimestamp === update.timestamp) {
      passengerAnimationData.pop();
    } else {
      lastAnimationData.endTimestamp = update.timestamp;
      lastAnimationData.endOrder = update.order;
    }

    passengerAnimationData.push(newAnimationData);
  }

  private handleCreateVehicle(
    animatedSimulationState: AnimatedSimulationState,
    update: SimulationUpdate<'createVehicle'>,
    polylines: Record<string, Polyline> | null,
  ): void {
    const vehicle = update.data;

    animatedSimulationState.animationData.vehicles[vehicle.id] = [
      this.getVehicleAnimationDataFromVehicle(
        vehicle,
        polylines,
        animatedSimulationState.timestamp,
        animatedSimulationState.order,
      ),
    ];
  }

  private handleUpdateVehicleStatus(
    animatedSimulationState: AnimatedSimulationState,
    update: SimulationUpdate<'updateVehicleStatus'>,
  ): void {
    const vehicleId = update.data.id;
    const status = update.data.status;

    const vehicleAnimationData =
      animatedSimulationState.animationData.vehicles[vehicleId];

    if (vehicleAnimationData === undefined) {
      console.error(
        'Vehicle animation data not found',
        animatedSimulationState,
        update,
      );
      return;
    }

    const lastAnimationData =
      vehicleAnimationData[vehicleAnimationData.length - 1];

    if (lastAnimationData.startTimestamp === update.timestamp) {
      lastAnimationData.status = status;
    } else {
      lastAnimationData.endTimestamp = update.timestamp;
      lastAnimationData.endOrder = update.order;
      vehicleAnimationData.push({
        ...lastAnimationData,
        startTimestamp: update.timestamp,
        startOrder: update.order,
        endTimestamp: null,
        endOrder: null,
        status,
      });
    }
  }

  private handleUpdateVehicleStops(
    animatedSimulationState: AnimatedSimulationState,
    update: SimulationUpdate<'updateVehicleStops'>,
    polylines: Record<string, Polyline> | null,
  ): void {
    const vehicleId = update.data.id;

    const vehicleAnimationData =
      animatedSimulationState.animationData.vehicles[vehicleId];

    if (vehicleAnimationData === undefined) {
      console.error(
        'Vehicle animation data not found',
        animatedSimulationState,
        update,
      );
      return;
    }

    const vehicle = animatedSimulationState.vehicles[vehicleId];

    const lastAnimationData =
      vehicleAnimationData[vehicleAnimationData.length - 1];

    const newAnimationData = this.getVehicleAnimationDataFromVehicle(
      vehicle,
      polylines,
      update.timestamp,
      update.order,
    );

    if (lastAnimationData.startTimestamp === update.timestamp) {
      vehicleAnimationData.pop();
    } else {
      lastAnimationData.endTimestamp = update.timestamp;
      lastAnimationData.endOrder = update.order;
    }

    vehicleAnimationData.push(newAnimationData);
  }

  private updateEndTimestamps(
    animatedSimulationState: AnimatedSimulationState,
  ): void {
    for (const passengerAnimationData of Object.values(
      animatedSimulationState.animationData.passengers,
    )) {
      if (passengerAnimationData.length === 0) {
        continue;
      }

      passengerAnimationData[passengerAnimationData.length - 1].endTimestamp =
        animatedSimulationState.animationData.endTimestamp;
    }

    for (const vehicleAnimationData of Object.values(
      animatedSimulationState.animationData.vehicles,
    )) {
      if (vehicleAnimationData.length === 0) {
        continue;
      }

      vehicleAnimationData[vehicleAnimationData.length - 1].endTimestamp =
        animatedSimulationState.animationData.endTimestamp;
    }
  }

  private getDisplayedPolylines(
    vehicle: Vehicle,
    polylines: Record<string, Polyline> | null,
  ): DisplayedPolylines {
    const allStops = getAllStops(vehicle);

    const isVehicleTravelling =
      vehicle.currentStop === null &&
      vehicle.previousStops.length > 0 &&
      vehicle.nextStops.length > 0;
    const currentPolylineStartTime = isVehicleTravelling
      ? vehicle.previousStops[vehicle.previousStops.length - 1].departureTime
      : null;
    const currentPolylineEndTime = isVehicleTravelling
      ? vehicle.nextStops[0].arrivalTime
      : null;
    const currentPolylineIndex = vehicle.previousStops.length - 1;

    const displayedPolylines: DisplayedPolylines = {
      polylines: [],
      currentPolylineStartTime,
      currentPolylineEndTime,
      currentPolylineIndex,
    };

    if (polylines === null) {
      displayedPolylines.currentPolylineIndex = -1;
      return displayedPolylines;
    }

    for (let i = 0; i < allStops.length - 1; i++) {
      const stop = allStops[i];
      const nextStop = allStops[i + 1];

      const polyline = this.getPolylineForStops(stop, nextStop, polylines);

      if (polyline === null) {
        // Do not count the current polyline if it is not found
        // and if it is before the current stop
        if (
          displayedPolylines.polylines.length <=
          displayedPolylines.currentPolylineIndex
        ) {
          displayedPolylines.currentPolylineIndex -= 1;
        }
        continue;
      }

      displayedPolylines.polylines.push(polyline);
    }

    return displayedPolylines;
  }

  private getPolylineForStops(
    stop: Stop,
    nextStop: Stop,
    polylines: Record<string, Polyline> | null,
  ): Polyline | null {
    if (polylines === null) {
      return null;
    }

    const polylineId = stop.id + ',' + nextStop.id;
    return polylines[polylineId] ?? null;
  }

  private mergeAnimationData(
    firstAnimationData: AnimationData,
    secondAnimationData: AnimationData,
    mergeTimestamp: number,
  ): AnimationData {
    // This version really merge the two animation data but is pretty slow.
    // const mergedPassengerAnimationData: Record<
    //   string,
    //   PassengerAnimationData[]
    // > = {};

    // const allPassengerIds = new Set([
    //   ...Object.keys(firstAnimationData.passengers),
    //   ...Object.keys(secondAnimationData.passengers),
    // ]);

    // for (const passengerId of allPassengerIds) {
    //   const firstPassengerAnimationData =
    //     firstAnimationData.passengers[passengerId];
    //   const secondPassengerAnimationData =
    //     secondAnimationData.passengers[passengerId];

    //   const firstHasAnimationData =
    //     firstPassengerAnimationData !== undefined &&
    //     firstPassengerAnimationData.length > 0;
    //   const secondHasAnimationData =
    //     secondPassengerAnimationData !== undefined &&
    //     secondPassengerAnimationData.length > 0;

    //   if (!firstHasAnimationData && !secondHasAnimationData) {
    //     continue;
    //   }

    //   if (!firstHasAnimationData) {
    //     mergedPassengerAnimationData[passengerId] =
    //       secondPassengerAnimationData;
    //     continue;
    //   }

    //   if (!secondHasAnimationData) {
    //     mergedPassengerAnimationData[passengerId] = firstPassengerAnimationData;
    //     continue;
    //   }

    //   const lastFirstAnimationData =
    //     firstPassengerAnimationData[firstPassengerAnimationData.length - 1];
    //   const firstSecondAnimationData = secondPassengerAnimationData[0];

    //   const {
    //     startOrder: _1,
    //     startTimestamp: _2,
    //     endOrder: _3,
    //     endTimestamp: _4,
    //     ...firstComparableData
    //   } = lastFirstAnimationData;
    //   const {
    //     startOrder: _5,
    //     startTimestamp: _6,
    //     endOrder: _7,
    //     endTimestamp: _8,
    //     ...secondComparableData
    //   } = firstSecondAnimationData;

    //   if (!this.deepCompare(firstComparableData, secondComparableData)) {
    //     mergedPassengerAnimationData[passengerId] =
    //       firstPassengerAnimationData.concat(secondPassengerAnimationData);
    //     continue;
    //   } else {
    //     mergedPassengerAnimationData[passengerId] = firstPassengerAnimationData
    //       .slice(0, -1)
    //       .concat(secondPassengerAnimationData);
    //     firstSecondAnimationData.startOrder = lastFirstAnimationData.startOrder;
    //     firstSecondAnimationData.startTimestamp =
    //       lastFirstAnimationData.startTimestamp;
    //   }
    // }

    // const mergedVehicleAnimationData: Record<string, VehicleAnimationData[]> =
    //   {};

    // const allVehicleIds = new Set([
    //   ...Object.keys(firstAnimationData.vehicles),
    //   ...Object.keys(secondAnimationData.vehicles),
    // ]);

    // for (const vehicleId of allVehicleIds) {
    //   const firstVehicleAnimationData = firstAnimationData.vehicles[vehicleId];
    //   const secondVehicleAnimationData =
    //     secondAnimationData.vehicles[vehicleId];

    //   const firstHasAnimationData =
    //     firstVehicleAnimationData !== undefined &&
    //     firstVehicleAnimationData.length > 0;
    //   const secondHasAnimationData =
    //     secondVehicleAnimationData !== undefined &&
    //     secondVehicleAnimationData.length > 0;

    //   if (!firstHasAnimationData && !secondHasAnimationData) {
    //     continue;
    //   }

    //   if (!firstHasAnimationData) {
    //     mergedVehicleAnimationData[vehicleId] = secondVehicleAnimationData;
    //     continue;
    //   }

    //   if (!secondHasAnimationData) {
    //     mergedVehicleAnimationData[vehicleId] = firstVehicleAnimationData;
    //     continue;
    //   }

    //   const lastFirstAnimationData =
    //     firstVehicleAnimationData[firstVehicleAnimationData.length - 1];
    //   const firstSecondAnimationData = secondVehicleAnimationData[0];

    //   const {
    //     startOrder: _1,
    //     startTimestamp: _2,
    //     endOrder: _3,
    //     endTimestamp: _4,
    //     ...firstComparableData
    //   } = lastFirstAnimationData;
    //   const {
    //     startOrder: _5,
    //     startTimestamp: _6,
    //     endOrder: _7,
    //     endTimestamp: _8,
    //     ...secondComparableData
    //   } = firstSecondAnimationData;

    //   if (!this.deepCompare(firstComparableData, secondComparableData)) {
    //     mergedVehicleAnimationData[vehicleId] =
    //       firstVehicleAnimationData.concat(secondVehicleAnimationData);
    //     continue;
    //   } else {
    //     mergedVehicleAnimationData[vehicleId] = firstVehicleAnimationData
    //       .slice(0, -1)
    //       .concat(secondVehicleAnimationData);
    //     firstSecondAnimationData.startOrder = lastFirstAnimationData.startOrder;
    //     firstSecondAnimationData.startTimestamp =
    //       lastFirstAnimationData.startTimestamp;
    //   }
    // }

    // This version only concatenate the two animation data and is much faster.
    const mergedPassengerAnimationData: Record<
      string,
      PassengerAnimationData[]
    > = {};
    const mergedVehicleAnimationData: Record<string, VehicleAnimationData[]> =
      {};

    for (const passengerId in firstAnimationData.passengers) {
      const passengerAnimationData = firstAnimationData.passengers[passengerId];
      if (
        passengerAnimationData !== undefined &&
        passengerAnimationData.length > 0
      ) {
        const lastAnimationData =
          passengerAnimationData[passengerAnimationData.length - 1];
        lastAnimationData.endTimestamp = mergeTimestamp;
      }
      mergedPassengerAnimationData[passengerId] = passengerAnimationData;
    }
    for (const vehicleId in firstAnimationData.vehicles) {
      const vehicleAnimationData = firstAnimationData.vehicles[vehicleId];
      if (
        vehicleAnimationData !== undefined &&
        vehicleAnimationData.length > 0
      ) {
        const lastAnimationData =
          vehicleAnimationData[vehicleAnimationData.length - 1];
        lastAnimationData.endTimestamp = mergeTimestamp;
      }
      mergedVehicleAnimationData[vehicleId] = vehicleAnimationData;
    }

    for (const passengerId in secondAnimationData.passengers) {
      if (mergedPassengerAnimationData[passengerId] === undefined) {
        mergedPassengerAnimationData[passengerId] =
          secondAnimationData.passengers[passengerId];
      } else {
        mergedPassengerAnimationData[passengerId] =
          mergedPassengerAnimationData[passengerId].concat(
            secondAnimationData.passengers[passengerId],
          );
      }
    }
    for (const vehicleId in secondAnimationData.vehicles) {
      if (mergedVehicleAnimationData[vehicleId] === undefined) {
        mergedVehicleAnimationData[vehicleId] =
          secondAnimationData.vehicles[vehicleId];
      } else {
        mergedVehicleAnimationData[vehicleId] = mergedVehicleAnimationData[
          vehicleId
        ].concat(secondAnimationData.vehicles[vehicleId]);
      }
    }

    return {
      passengers: mergedPassengerAnimationData,
      vehicles: mergedVehicleAnimationData,
      startTimestamp: firstAnimationData.startTimestamp,
      startOrder: firstAnimationData.startOrder,
      endTimestamp: secondAnimationData.endTimestamp,
      endOrder: secondAnimationData.endOrder,
    };
  }

  // private deepCompare(
  //   a: Record<string, unknown>,
  //   b: Record<string, unknown>,
  // ): boolean {
  //   if (Object.keys(a).length !== Object.keys(b).length) {
  //     return false;
  //   }

  //   for (const key in a) {
  //     if (a[key] !== b[key]) {
  //       return false;
  //     }
  //   }

  //   return true;
  // }
}

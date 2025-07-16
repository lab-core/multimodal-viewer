import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { decode } from 'polyline';
import { Leg } from '../interfaces/leg.model';
import { extractPassenger, Passenger } from '../interfaces/passenger.model';
import {
  AllPolylines,
  AnimatedSimulationState,
  AnimatedSimulationStates,
  AnimationData,
  AnyPassengerAnimationData,
  AnySimulationUpdate,
  AnyVehicleAnimationData,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  PassengerAnimationData,
  Polyline,
  RawSimulationEnvironment,
  RawSimulationState,
  Simulation,
  SIMULATION_UPDATE_TYPES,
  SimulationEnvironment,
  SimulationState,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  VehicleAnimationData,
} from '../interfaces/simulation.model';
import { Stop } from '../interfaces/stop.model';
import {
  extractVehicle,
  getAllStops,
  Vehicle,
} from '../interfaces/vehicle.model';
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
        stateUpdateIndexesToKeep,
        shouldRequestMoreStates,
        firstContinuousStateUpdateIndex,
        lastContinuousStateUpdateIndex,
        currentStateUpdateIndex,
      ) => {
        this._simulationStatesSignal.update((states) => {
          const parsedMissingStates = (rawMissingStates as string[]).map(
            (rawState) => JSON.parse(rawState) as RawSimulationState,
          );
          const parsedMissingUpdates = Object.entries(
            rawMissingUpdates as Record<string, string[]>,
          ).reduce(
            (acc, [updateIndex, rawUpdates]) => {
              acc[parseInt(updateIndex)] = rawUpdates.map(
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
            stateUpdateIndexesToKeep as number[],
            !!shouldRequestMoreStates,
            firstContinuousStateUpdateIndex as number,
            lastContinuousStateUpdateIndex as number,
            currentStateUpdateIndex as number,
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
    allStateUpdateIndexes: number[],
  ) {
    this._isFetchingStatesSignal.set(true);

    this.communicationService.emit(
      'get-missing-simulation-states',
      simulationId,
      visualizationTime,
      allStateUpdateIndexes,
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

    const updateIndex = simulationUpdate.updateIndex;
    if (updateIndex === undefined) {
      console.error('Simulation update update index not found: ', updateIndex);
      return null;
    }

    const timestamp = simulationUpdate.timestamp;
    if (timestamp === undefined) {
      console.error('Simulation update timestamp not found: ', timestamp);
      return null;
    }

    const data = simulationUpdate.data;
    switch (type) {
      case 'updateStatistic': {
        return {
          type,
          updateIndex: updateIndex,
          timestamp,
          data,
        };
      }

      default:
        return null;
    }
  }

  private extractSimulationEnvironment(
    data: RawSimulationEnvironment,
  ): SimulationEnvironment | null {
    // TODO Uncomment for debugging
    // console.debug('Extracting simulation environment: ', data);

    const passengers: SimulationEnvironment['passengers'] = {};
    for (const passenger of data.passengers) {
      const extractedPassenger = extractPassenger(passenger);
      if (!extractedPassenger) {
        console.error('Invalid passenger: ', passenger);
        return null;
      }
      passengers[extractedPassenger.id] = extractedPassenger;
    }

    const vehicles: SimulationEnvironment['vehicles'] = {};
    for (const vehicle of data.vehicles) {
      const extractedVehicle = extractVehicle(vehicle);
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

    const updateIndex = data.updateIndex;
    if (updateIndex === undefined) {
      console.error(
        'Simulation environment updateIndex not found: ',
        updateIndex,
      );
      return null;
    }

    return {
      passengers,
      vehicles,
      timestamp,
      statistic,
      updateIndex: updateIndex,
    };
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

    const rawUpdates = allUpdates[environment.updateIndex];
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
      state.updateIndex = lastUpdate.updateIndex;
      state.timestamp = lastUpdate.timestamp;
    }

    return state;
  }

  applyUpdate(
    update: AnySimulationUpdate,
    simulationEnvironment: SimulationEnvironment,
  ) {
    simulationEnvironment.updateIndex = update.updateIndex;
    simulationEnvironment.timestamp = update.timestamp;

    switch (update.type) {
      case 'updateStatistic':
        {
          simulationEnvironment.statistic = update.data.statistic;
        }
        break;
    }
  }

  private mergeStates(
    states: AnimatedSimulationStates,
    missingStates: SimulationState[],
    stateUpdateIndexesToKeep: number[],
    shouldRequestMoreStates: boolean,
    firstContinuousStateUpdateIndex: number,
    lastContinuousStateUpdateIndex: number,
    currentStateUpdateIndex: number,
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
      if (stateUpdateIndexesToKeep.includes(state.updateIndex)) {
        animatedMissingStates.push(state);
      }
    }

    const sortedStates = animatedMissingStates.sort(
      (a, b) => a.updateIndex - b.updateIndex,
    );

    const firstStateIndex = sortedStates.findIndex(
      (state) => state.updateIndex === firstContinuousStateUpdateIndex,
    );
    const lastStateIndex = sortedStates.findIndex(
      (state) => state.updateIndex === lastContinuousStateUpdateIndex,
    );

    const currentStateIndex = sortedStates.findIndex(
      (state) => state.updateIndex === currentStateUpdateIndex,
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
        firstContinuousStateUpdateIndex,
      );
      return defaultReturnValue;
    }
    if (lastStateIndex === -1) {
      console.error(
        'Last continuous state not found: ',
        lastContinuousStateUpdateIndex,
      );
      return defaultReturnValue;
    }
    if (currentStateIndex === -1) {
      console.error('Current state not found: ', currentStateUpdateIndex);
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
      updateIndex: firstState.updateIndex,
      index: firstStateIndex,
    };

    const lastContinuousUpdate =
      lastState.updates[lastState.updates.length - 1];

    const lastContinuousState = {
      timestamp: lastContinuousUpdate?.timestamp ?? lastState.timestamp,
      updateIndex: lastContinuousUpdate?.updateIndex ?? lastState.updateIndex,
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
      animatedSimulationState.animationData.endUpdateIndex = update.updateIndex;
      animatedSimulationState.animationData.endTimestamp = update.timestamp;

      switch (update.type) {
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
        startUpdateIndex: state.updateIndex,
        endTimestamp: state.timestamp,
        endUpdateIndex: state.updateIndex,
      },
    };

    for (const vehicle of Object.values(state.vehicles)) {
      animatedSimulationState.animationData.vehicles[vehicle.id] = [
        this.getVehicleAnimationDataFromVehicle(
          vehicle,
          polylines,
          state.timestamp,
          state.updateIndex,
        ),
      ];
    }

    for (const passenger of Object.values(state.passengers)) {
      animatedSimulationState.animationData.passengers[passenger.id] = [
        this.getPassengerAnimationDataFromPassenger(
          passenger,
          state.timestamp,
          state.updateIndex,
          state.timestamp,
        ),
      ];
    }

    return animatedSimulationState;
  }

  private getPassengerAnimationDataFromPassenger(
    passenger: Passenger,
    startTimestamp: number,
    startUpdateIndex: number,
    currentTimestamp: number,
  ): AnyPassengerAnimationData {
    const basicAnimationData: PassengerAnimationData = {
      status: passenger.status,
      startTimestamp,
      startUpdateIndex,
      endTimestamp: null,
      endUpdateIndex: null,
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

    if (leg.assignedVehicleId === null) {
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
    startUpdateIndex: number,
  ): AnyVehicleAnimationData {
    const basicAnimationData: VehicleAnimationData = {
      status: vehicle.status,
      startTimestamp,
      startUpdateIndex,
      endTimestamp: null,
      endUpdateIndex: null,
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
      startUpdateIndex: firstAnimationData.startUpdateIndex,
      endTimestamp: secondAnimationData.endTimestamp,
      endUpdateIndex: secondAnimationData.endUpdateIndex,
    };
  }
}

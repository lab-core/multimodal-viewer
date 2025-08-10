import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import {
  AnimatedSimulationState,
  AnimatedSimulationStates,
  AnimationData,
  AnyPassengerAnimationData,
  AnyVehicleAnimationData,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  PassengerAnimationData,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  StatisticsAnimationData,
  VehicleAnimationData,
} from '../interfaces/animation.model';
import { SimulationEnvironment } from '../interfaces/environment.model';
import { Leg } from '../interfaces/leg.model';
import { Passenger } from '../interfaces/passenger.model';
import {
  AllPolylines,
  extractAllPolylines,
  Polyline,
} from '../interfaces/polylines.model';
import { Simulation } from '../interfaces/simulation.model';
import {
  extractSimulationStates,
  SimulationState,
} from '../interfaces/state.model';
import { Stop } from '../interfaces/stop.model';
import {
  PassengerUpdate,
  StatisticsUpdate,
  VehicleUpdate,
} from '../interfaces/update.model';
import { getAllStops, Vehicle } from '../interfaces/vehicle.model';
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
        serializedMissingStatesEnvironments,
        serializedMissingStatesUpdates,
        stateUpdateIndexesToKeep,
        shouldRequestMoreStates,
        firstContinuousStateUpdateIndex,
        lastContinuousStateUpdateIndex,
        currentStateUpdateIndex,
      ) => {
        const missingStates = extractSimulationStates(
          serializedMissingStatesEnvironments,
          serializedMissingStatesUpdates,
        );

        if (missingStates === null) {
          console.error(
            'Failed to extract missing simulation states from the server response.',
          );
          return;
        }

        this._simulationStatesSignal.update((states) => {
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
          extractAllPolylines(polylinesByCoordinates, version),
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

  // MARK: Build environment
  /**
   * Apply an update to the simulation environment in place.
   */
  buildEnvironment(
    state: SimulationState,
    visualizationTime: number,
  ): SimulationEnvironment {
    for (const update of state.updates) {
      if (update.timestamp > visualizationTime) {
        break;
      }

      update.apply(state);
    }

    return state;
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
      update.apply(animatedSimulationState);
      animatedSimulationState.animationData.endUpdateIndex = update.updateIndex;
      animatedSimulationState.animationData.endTimestamp = update.timestamp;

      switch (update.updateType) {
        case 'passenger':
          {
            const passengerUpdate = update as PassengerUpdate;
            const passengerId = passengerUpdate.passengerId;
            const passenger = state.passengers[passengerId];

            if (
              animatedSimulationState.animationData.passengers[passengerId] ===
              undefined
            ) {
              animatedSimulationState.animationData.passengers[passengerId] =
                [];
            }
            const currentAnimationData =
              animatedSimulationState.animationData.passengers[passengerId];

            const lastAnimationData: AnyPassengerAnimationData =
              currentAnimationData[currentAnimationData.length - 1];

            const animationData = this.getPassengerAnimationDataFromPassenger(
              passenger,
              update.timestamp,
              update.updateIndex,
              update.timestamp,
            );

            if (lastAnimationData !== undefined) {
              if (
                lastAnimationData.startTimestamp ===
                animationData.startTimestamp
              ) {
                currentAnimationData.pop();
              } else {
                lastAnimationData.endTimestamp = update.timestamp;
                lastAnimationData.endUpdateIndex = update.updateIndex;
              }
            }

            currentAnimationData.push(animationData);
          }
          break;
        case 'vehicle':
          {
            const vehicleUpdate = update as VehicleUpdate;
            const vehicleId = vehicleUpdate.vehicleId;
            const vehicle = state.vehicles[vehicleId];

            if (
              animatedSimulationState.animationData.vehicles[vehicleId] ===
              undefined
            ) {
              animatedSimulationState.animationData.vehicles[vehicleId] = [];
            }
            const currentAnimationData =
              animatedSimulationState.animationData.vehicles[vehicleId];

            const lastAnimationData: AnyVehicleAnimationData =
              currentAnimationData[currentAnimationData.length - 1];

            const animationData = this.getVehicleAnimationDataFromVehicle(
              vehicle,
              polylines,
              update.timestamp,
              update.updateIndex,
            );

            if (lastAnimationData !== undefined) {
              if (
                lastAnimationData.startTimestamp ===
                animationData.startTimestamp
              ) {
                currentAnimationData.pop();
              } else {
                lastAnimationData.endTimestamp = update.timestamp;
                lastAnimationData.endUpdateIndex = update.updateIndex;
              }
            }

            currentAnimationData.push(animationData);
          }
          break;
        case 'statistics':
          {
            const statisticsUpdate = update as StatisticsUpdate;

            const animationData: StatisticsAnimationData = {
              statistics: statisticsUpdate.statistics,
              startTimestamp: statisticsUpdate.timestamp,
              endTimestamp: null,
              startUpdateIndex: statisticsUpdate.updateIndex,
              endUpdateIndex: null,
            };

            const lastStatisticsAnimationData: StatisticsAnimationData =
              animatedSimulationState.animationData.statistics[
                animatedSimulationState.animationData.statistics.length - 1
              ];

            if (lastStatisticsAnimationData !== undefined) {
              if (
                lastStatisticsAnimationData.startTimestamp ===
                statisticsUpdate.timestamp
              ) {
                animatedSimulationState.animationData.statistics.pop();
              } else {
                lastStatisticsAnimationData.endTimestamp =
                  statisticsUpdate.timestamp;
                lastStatisticsAnimationData.endUpdateIndex =
                  statisticsUpdate.updateIndex;
              }
            }

            animatedSimulationState.animationData.statistics.push(
              animationData,
            );
          }
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
        statistics: [],
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

    animatedSimulationState.animationData.statistics.push({
      statistics: state.statistics,
      startTimestamp: state.timestamp,
      endTimestamp: null,
      startUpdateIndex: state.updateIndex,
      endUpdateIndex: null,
    });

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

    const lastStatisticsAnimationData: StatisticsAnimationData =
      animatedSimulationState.animationData.statistics[
        animatedSimulationState.animationData.statistics.length - 1
      ];
    if (lastStatisticsAnimationData !== undefined) {
      lastStatisticsAnimationData.endTimestamp =
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

    const firstStatistics = firstAnimationData.statistics;
    const secondStatistics = secondAnimationData.statistics;
    const mergedStatistics: StatisticsAnimationData[] = [
      ...firstStatistics,
      ...secondStatistics,
    ];

    return {
      passengers: mergedPassengerAnimationData,
      vehicles: mergedVehicleAnimationData,
      startTimestamp: firstAnimationData.startTimestamp,
      startUpdateIndex: firstAnimationData.startUpdateIndex,
      endTimestamp: secondAnimationData.endTimestamp,
      endUpdateIndex: secondAnimationData.endUpdateIndex,
      statistics: mergedStatistics,
    };
  }
}

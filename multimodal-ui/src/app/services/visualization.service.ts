import {
  computed,
  effect,
  Injectable,
  Injector,
  runInInjectionContext,
  Signal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedVehicle,
  AnyPassengerAnimationData,
  AnyVehicleAnimationData,
  displayed,
  DynamicVehicleAnimationData,
  Passenger,
  PassengerStatus,
  PassengerStatusUpdate,
  RUNNING_SIMULATION_STATUSES,
  Simulation,
  SimulationEnvironment,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  Stop,
  Vehicle,
  VehicleStatus,
  VehicleStatusUpdate,
} from '../interfaces/simulation.model';
import { CommunicationService } from './communication.service';
import { SimulationService } from './simulation.service';

@Injectable()
export class VisualizationService {
  // MARK: Properties
  private timeout: number | null = null;

  private readonly MIN_STATES_DEBOUNCE_TIME = 800;
  private fetchStatesTimeout: number | null = null;
  private lastFetchStatesTime = 0;

  private readonly MIN_POLYLINES_DEBOUNCE_TIME = 800;
  private fetchPolylinesTimeout: number | null = null;
  private lastFetchPolylinesTime = 0;

  private speed = 1;

  private tick = -1;
  private readonly tickSignal: WritableSignal<number> = signal<number>(0);

  private readonly _simulationStartTimeSignal: WritableSignal<number | null> =
    signal<number | null>(null);
  private readonly _simulationEndTimeSignal: WritableSignal<number | null> =
    signal<number | null>(null);
  private readonly _visualizationMaxTimeSignal: WritableSignal<number | null> =
    signal<number | null>(null);

  private readonly _isVisualizationPausedSignal = signal<boolean>(false);

  // MARK: +- Time Logic
  private visualizationTimeOverride: number | null = null;
  private readonly visualizationTimeOverrideSignal: WritableSignal<
    number | null
  > = signal<number | null>(null);

  private wantedVisualizationTime: number | null = null;
  private readonly _wantedVisualizationTimeSignal: Signal<number | null> =
    computed(() => {
      const simulationStartTime = this.simulationStartTimeSignal();
      const visualizationMaxTime = this.visualizationMaxTimeSignal();

      if (simulationStartTime === null || visualizationMaxTime === null) {
        return null;
      }

      const isLoading = this._isLoadingSignal();
      const tick = this.tickSignal();
      const visualizationTimeOverride = this.visualizationTimeOverrideSignal();
      const isVisualizationPaused = this.isVisualizationPausedSignal();

      if (this.wantedVisualizationTime === null) {
        return simulationStartTime;
      }

      if (
        visualizationTimeOverride !== this.visualizationTimeOverride &&
        visualizationTimeOverride !== null
      ) {
        this.visualizationTimeOverride = visualizationTimeOverride;
        return Math.min(visualizationMaxTime, visualizationTimeOverride);
      }

      if (isLoading) {
        return this.wantedVisualizationTime;
      }

      if (tick === this.tick) {
        return this.wantedVisualizationTime;
      }

      this.tick = tick;

      if (isVisualizationPaused) {
        return this.wantedVisualizationTime;
      }

      return Math.min(visualizationMaxTime, this.wantedVisualizationTime + 1);
    });

  // MARK: +- Visualization Environment
  private visualizationEnvironment: SimulationEnvironment | null = null;
  readonly visualizationEnvironmentSignal: Signal<SimulationEnvironment | null> =
    computed(() => {
      const wantedVisualizationTime = this._wantedVisualizationTimeSignal();
      const simulationStates = this.simulationService.simulationStatesSignal();

      if (
        simulationStates.states.length === 0 ||
        wantedVisualizationTime === null ||
        !simulationStates.states.every((state) => state.updates.length > 0)
      ) {
        console.error(
          'No simulation states found for visualization time:',
          wantedVisualizationTime,
        );
        return this.visualizationEnvironment;
      }

      if (
        simulationStates.firstContinuousState === null ||
        simulationStates.lastContinuousState === null ||
        simulationStates.currentState === null
      ) {
        return this.visualizationEnvironment;
      }

      // Get last state with a timestamp less than or equal to the wanted visualization time
      let state = simulationStates.states[0];
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < simulationStates.states.length; i++) {
        if (simulationStates.states[i].timestamp <= wantedVisualizationTime) {
          state = simulationStates.states[i];
        } else {
          break;
        }
      }

      const polylines = this.simulationService.simulationPolylinesSignal();

      const environment = this.simulationService.buildEnvironment(
        structuredClone(state),
        polylines?.polylinesByVehicleId ?? {},
        wantedVisualizationTime,
      );

      environment.timestamp = wantedVisualizationTime;

      this.visualizationEnvironment = environment;

      return environment;
    });

  readonly animatedSimulationEnvironmentSignal: Signal<AnimatedSimulationEnvironment | null> =
    computed(() => {
      const simulationEnvironment = this.visualizationEnvironmentSignal();

      // We only want to update this signal when the environment changes to avoid unnecessary re-renders.
      const simulationStates = untracked(
        this.simulationService.simulationStatesSignal,
      );
      const polylinesByVehicleId = untracked(
        this.simulationService.simulationPolylinesSignal,
      );

      if (
        simulationEnvironment === null ||
        simulationStates.firstContinuousState === null ||
        simulationStates.lastContinuousState === null
      ) {
        return null;
      }

      const continuousStates = simulationStates.states.slice(
        simulationStates.firstContinuousState.index,
        simulationStates.lastContinuousState.index + 1,
      );

      if (continuousStates.length === 0) {
        return null;
      }

      const allUpdates = continuousStates.flatMap((state) => state.updates);

      const firstState = continuousStates[0];

      const lastState = continuousStates.slice(-1)[0];

      const lastEnvironment = this.simulationService.buildEnvironment(
        structuredClone(lastState),
        polylinesByVehicleId?.polylinesByVehicleId ?? {},
        simulationStates.lastContinuousState.timestamp,
      );

      const passengerStatusUpdates: Record<
        string,
        {
          status: PassengerStatus;
          timestamp: number;
        }[]
      > = {};
      const vehicleStatusUpdates: Record<
        string,
        {
          status: VehicleStatus;
          timestamp: number;
        }[]
      > = {};

      // Initialize status updates
      for (const passenger of Object.values(lastEnvironment.passengers)) {
        passengerStatusUpdates[passenger.id] = [];
      }

      for (const vehicle of Object.values(lastEnvironment.vehicles)) {
        vehicleStatusUpdates[vehicle.id] = [];
      }

      // Add first status updates
      for (const passenger of Object.values(firstState.passengers)) {
        passengerStatusUpdates[passenger.id].push({
          status: passenger.status,
          timestamp: firstState.timestamp,
        });
      }

      for (const vehicle of Object.values(firstState.vehicles)) {
        vehicleStatusUpdates[vehicle.id].push({
          status: vehicle.status,
          timestamp: firstState.timestamp,
        });
      }

      for (const update of allUpdates) {
        switch (update.type) {
          case 'createPassenger':
            {
              const passenger = update.data as Passenger;
              passengerStatusUpdates[passenger.id] = [
                {
                  status: passenger.status,
                  timestamp: update.timestamp,
                },
              ];
            }
            break;
          case 'updatePassengerStatus':
            {
              const passengerStatusUpdate =
                update.data as PassengerStatusUpdate;
              passengerStatusUpdates[passengerStatusUpdate.id].push({
                status: passengerStatusUpdate.status,
                timestamp: update.timestamp,
              });
            }
            break;
          case 'createVehicle':
            {
              const vehicle = update.data as Vehicle;
              vehicleStatusUpdates[vehicle.id] = [
                {
                  status: vehicle.status,
                  timestamp: update.timestamp,
                },
              ];
            }
            break;
          case 'updateVehicleStatus':
            {
              const vehicleStatusUpdate = update.data as VehicleStatusUpdate;
              vehicleStatusUpdates[vehicleStatusUpdate.id].push({
                status: vehicleStatusUpdate.status,
                timestamp: update.timestamp,
              });
            }
            break;
          default:
            break;
        }
      }

      const animatedPassengers: Record<string, AnimatedPassenger> = {};

      for (const passenger of Object.values(lastEnvironment.passengers)) {
        const animatedPassenger = this.getPassengerAnimationDataFromPassenger(
          passenger,
          simulationStates.firstContinuousState.timestamp,
          simulationStates.lastContinuousState.timestamp,
          passengerStatusUpdates[passenger.id] ?? [],
          lastEnvironment.vehicles,
        );

        animatedPassengers[passenger.id] = animatedPassenger;
      }

      const animatedVehicles: Record<string, AnimatedVehicle> = {};

      for (const vehicle of Object.values(lastEnvironment.vehicles)) {
        const animatedVehicle = this.getVehicleAnimationDataFromVehicle(
          vehicle,
          simulationStates.firstContinuousState.timestamp,
          simulationStates.lastContinuousState.timestamp,
          vehicleStatusUpdates[vehicle.id] ?? [],
        );

        animatedVehicles[vehicle.id] = animatedVehicle;
      }

      // Find if each passenger is displayed
      const displayedPassenger: Record<string, displayed<Passenger>> = {};
      for (const passenger of Object.values(simulationEnvironment.passengers)) {
        const animatedPassenger = animatedPassengers[passenger.id];

        if (animatedPassenger === undefined) {
          displayedPassenger[passenger.id] = {
            ...passenger,
            notDisplayedReason: 'Passenger not found',
          };
          continue;
        }

        if (animatedPassenger.animationData.length === 0) {
          displayedPassenger[passenger.id] = {
            ...passenger,
            notDisplayedReason: 'Passenger has no animation data',
          };
          continue;
        }

        const currentAnimationData = animatedPassenger.animationData.find(
          (animationData) =>
            animationData.startTimestamp <= simulationEnvironment.timestamp &&
            animationData.endTimestamp >= simulationEnvironment.timestamp,
        );

        if (currentAnimationData === undefined) {
          displayedPassenger[passenger.id] = {
            ...passenger,
            notDisplayedReason: 'Passenger animation data not found',
          };
          continue;
        }

        if (currentAnimationData.notDisplayedReason !== null) {
          displayedPassenger[passenger.id] = {
            ...passenger,
            notDisplayedReason: currentAnimationData.notDisplayedReason,
          };
          continue;
        }
      }

      // Find if each vehicle is displayed
      const displayedVehicle: Record<string, displayed<Vehicle>> = {};

      for (const vehicle of Object.values(simulationEnvironment.vehicles)) {
        const animatedVehicle = animatedVehicles[vehicle.id];

        if (animatedVehicle.animationData.length === 0) {
          displayedVehicle[vehicle.id] = {
            ...vehicle,
            notDisplayedReason: 'Vehicle has no animation data',
          };
          continue;
        }

        const currentAnimationData = animatedVehicle.animationData.find(
          (animationData) =>
            animationData.startTimestamp <= simulationEnvironment.timestamp &&
            animationData.endTimestamp >= simulationEnvironment.timestamp,
        );

        if (currentAnimationData === undefined) {
          displayedVehicle[vehicle.id] = {
            ...vehicle,
            notDisplayedReason: 'Vehicle animation data not found',
          };
          continue;
        }

        if (currentAnimationData.notDisplayedReason !== null) {
          displayedVehicle[vehicle.id] = {
            ...vehicle,
            notDisplayedReason: currentAnimationData.notDisplayedReason,
          };
          continue;
        }
      }

      const animatedSimulationEnvironment: AnimatedSimulationEnvironment = {
        ...simulationEnvironment,
        passengers: displayedPassenger,
        vehicles: displayedVehicle,
        animationData: {
          passengers: animatedPassengers,
          vehicles: animatedVehicles,
          startTimestamp: simulationStates.firstContinuousState.timestamp,
          endTimestamp: simulationStates.lastContinuousState.timestamp,
        },
      };

      return animatedSimulationEnvironment;
    });

  private readonly _isLoadingSignal: WritableSignal<boolean> = signal(true);

  // MARK: Constructor
  constructor(
    private readonly injector: Injector,
    private readonly communicationService: CommunicationService,
    private readonly simulationService: SimulationService,
  ) {
    effect(() => {
      this.animatedSimulationEnvironmentSignal();
    });
    effect(() => {
      const wantedVisualizationTime = this._wantedVisualizationTimeSignal();
      this.wantedVisualizationTime = wantedVisualizationTime;
    });

    effect(() => {
      const simulation = this.simulationService.activeSimulationSignal();

      if (simulation === null) {
        return;
        this._isLoadingSignal.set(true);
      }

      const wantedVisualizationTime = this._wantedVisualizationTimeSignal();

      if (wantedVisualizationTime === null) {
        this._isLoadingSignal.set(true);
        return;
      }

      const simulationStates = this.simulationService.simulationStatesSignal();
      const isFetching = this.simulationService.isFetchingStatesSignal();

      const isCurrentStateAvailable =
        simulationStates.firstContinuousState !== null &&
        simulationStates.lastContinuousState !== null &&
        simulationStates.firstContinuousState.timestamp !== null &&
        simulationStates.lastContinuousState.timestamp !== null &&
        wantedVisualizationTime >=
          simulationStates.firstContinuousState.timestamp &&
        wantedVisualizationTime <=
          simulationStates.lastContinuousState.timestamp;

      const hasCurrentStateShifted =
        simulationStates.currentState === null ||
        wantedVisualizationTime <
          simulationStates.currentState.startTimestamp ||
        wantedVisualizationTime > simulationStates.currentState.endTimestamp;

      if (
        isCurrentStateAvailable &&
        !simulationStates.shouldRequestMoreStates &&
        !hasCurrentStateShifted
      ) {
        this._isLoadingSignal.set(false);
        return;
      }

      const allStateOrders: number[] = simulationStates.states.map(
        (state) => state.order,
      );
      // Remove last state if shouldRequestMoreStates is true because it could be incomplete
      if (simulationStates.shouldRequestMoreStates) {
        allStateOrders.pop();
      }

      if (!isFetching) {
        this.getMissingSimulationStates(
          simulation.id,
          wantedVisualizationTime,
          simulationStates.states.map((state) => state.order),
        );
      }

      this._isLoadingSignal.set(
        simulationStates.firstContinuousState === null ||
          simulationStates.lastContinuousState === null ||
          wantedVisualizationTime <
            simulationStates.firstContinuousState.timestamp ||
          wantedVisualizationTime >
            simulationStates.lastContinuousState.timestamp,
      );
    });

    effect(() => {
      const simulation = this.simulationService.activeSimulationSignal();

      if (simulation === null) {
        return;
      }

      const polylines = this.simulationService.simulationPolylinesSignal();
      const isFetching = this.simulationService.isFetchingPolylinesSignal();

      const needPolylineUpdate =
        polylines === null || polylines.version !== simulation.polylinesVersion;

      if (needPolylineUpdate && !isFetching) {
        this.getPolylines(simulation.id);
      }
    });
  }

  // MARK: Lifecycle
  init(simulation: Simulation) {
    this._simulationStartTimeSignal.set(simulation.simulationStartTime ?? null);
    this._simulationEndTimeSignal.set(
      simulation.simulationEndTime ??
        simulation.simulationEstimatedEndTime ??
        null,
    );
    this._visualizationMaxTimeSignal.set(
      (RUNNING_SIMULATION_STATUSES.includes(simulation.status)
        ? (simulation.simulationTime ?? simulation.simulationStartTime)
        : simulation.simulationEndTime) ?? null,
    );

    if (!this.isInitializedSignal()) {
      this._simulationStartTimeSignal.set(null);
      this._simulationEndTimeSignal.set(null);
      this._visualizationMaxTimeSignal.set(null);
      return;
    }

    if (this.timeout === null) {
      this.updateTick();
    }
  }

  destroy() {
    if (!this.isInitializedSignal()) {
      return;
    }

    this._simulationStartTimeSignal.set(null);
    this._simulationEndTimeSignal.set(null);
    this._visualizationMaxTimeSignal.set(null);

    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  // MARK: Getters
  get isInitializedSignal(): Signal<boolean> {
    return computed(
      () =>
        this._simulationStartTimeSignal() !== null &&
        this._simulationEndTimeSignal() !== null &&
        this._visualizationMaxTimeSignal() !== null,
    );
  }

  get simulationStartTimeSignal(): Signal<number | null> {
    return this._simulationStartTimeSignal;
  }

  get simulationEndTimeSignal(): Signal<number | null> {
    return this._simulationEndTimeSignal;
  }

  get visualizationMaxTimeSignal(): Signal<number | null> {
    return this._visualizationMaxTimeSignal;
  }

  get isVisualizationPausedSignal(): Signal<boolean> {
    return this._isVisualizationPausedSignal;
  }

  get wantedVisualizationTimeSignal(): Signal<number | null> {
    return this._wantedVisualizationTimeSignal;
  }

  get isLoadingSignal(): Signal<boolean> {
    return this._isLoadingSignal;
  }

  // MARK: Handlers
  pauseVisualization() {
    this._isVisualizationPausedSignal.set(true);
  }

  resumeVisualization() {
    this._isVisualizationPausedSignal.set(false);
  }

  setVisualizationTime(time: number) {
    this.visualizationTimeOverrideSignal.set(time);
  }

  setVisualizationSpeed(speed: number) {
    this.speed = speed;
  }

  // MARK: Private Methods
  private updateTick() {
    runInInjectionContext(this.injector, () => {
      this.tickSignal.update((tick) => tick + 1);
    });

    this.timeout = setTimeout(() => {
      this.updateTick();
    }, 1000 / this.speed) as unknown as number;
  }

  private getMissingSimulationStates(
    simulationId: string,
    wantedVisualizationTime: number,
    allStateOrders: number[],
  ) {
    if (this.fetchStatesTimeout !== null) {
      clearTimeout(this.fetchStatesTimeout);
      this.fetchStatesTimeout = null;
    }

    const currentTime = Date.now();
    const timeSinceLastDebounce = currentTime - this.lastFetchStatesTime;

    if (timeSinceLastDebounce < this.MIN_STATES_DEBOUNCE_TIME) {
      this.fetchStatesTimeout = setTimeout(() => {
        this.fetchStatesTimeout = null;
        this.lastFetchStatesTime = currentTime;
        this.simulationService.getMissingSimulationStates(
          simulationId,
          wantedVisualizationTime,
          allStateOrders,
        );
      }, this.MIN_STATES_DEBOUNCE_TIME - timeSinceLastDebounce) as unknown as number;
      return;
    }

    this.lastFetchStatesTime = currentTime;
    this.simulationService.getMissingSimulationStates(
      simulationId,
      wantedVisualizationTime,
      allStateOrders,
    );
  }

  private getPolylines(simulationId: string) {
    if (this.fetchPolylinesTimeout !== null) {
      clearTimeout(this.fetchPolylinesTimeout);
      this.fetchPolylinesTimeout = null;
    }

    const currentTime = Date.now();
    const timeSinceLastDebounce = currentTime - this.lastFetchPolylinesTime;

    if (timeSinceLastDebounce < this.MIN_POLYLINES_DEBOUNCE_TIME) {
      this.fetchPolylinesTimeout = setTimeout(() => {
        this.fetchPolylinesTimeout = null;
        this.lastFetchPolylinesTime = currentTime;
        this.simulationService.getPolylines(simulationId);
      }, this.MIN_POLYLINES_DEBOUNCE_TIME - timeSinceLastDebounce) as unknown as number;
      return;
    }

    this.lastFetchPolylinesTime = currentTime;
    this.simulationService.getPolylines(simulationId);
  }

  private getPassengerAnimationDataFromPassenger(
    passenger: Passenger,
    startTimestamp: number,
    endTimestamp: number,
    statusUpdates: {
      status: PassengerStatus;
      timestamp: number;
    }[],
    vehicles: Record<string, Vehicle>,
  ): AnimatedPassenger {
    const allLegs = passenger.previousLegs.concat(
      passenger.currentLeg === null ? [] : [passenger.currentLeg],
      passenger.nextLegs,
    );

    const allAnimationData: AnyPassengerAnimationData[] = [];

    if (allLegs.length === 0) {
      allAnimationData.push({
        status: passenger.status,
        startTimestamp: startTimestamp,
        endTimestamp: endTimestamp,
        notDisplayedReason: 'Passenger has no legs',
      });
    }

    let currentTimestamp = startTimestamp;

    for (let legIndex = 0; legIndex < allLegs.length; legIndex++) {
      const leg = allLegs[legIndex];

      if (leg.assignedVehicleId === null || leg.assignedTime === null) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: currentTimestamp,
          endTimestamp: endTimestamp,
          notDisplayedReason: 'Leg has no assigned vehicle',
        });
        break;
      }

      currentTimestamp = Math.max(leg.assignedTime, currentTimestamp);

      if (leg.assignedTime >= endTimestamp) {
        break;
      }

      const vehicle = vehicles[leg.assignedVehicleId];

      if (vehicle === undefined) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: currentTimestamp,
          endTimestamp: endTimestamp,
          notDisplayedReason: 'Vehicle not found',
        });
        break;
      }

      if (vehicle.polylines === null) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: currentTimestamp,
          endTimestamp: endTimestamp,
          notDisplayedReason: 'Vehicle has no polylines',
        });
        break;
      }

      if (leg.boardingStopIndex === null) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: currentTimestamp,
          endTimestamp: endTimestamp,
          notDisplayedReason: 'Leg has no boarding stop',
        });
        break;
      }

      if (leg.boardingTime === null || leg.boardingTime >= currentTimestamp) {
        const polyline =
          vehicle.polylines[Math.max(leg.boardingStopIndex - 1, 0)];

        if (polyline === undefined) {
          allAnimationData.push({
            status: passenger.status,
            startTimestamp: currentTimestamp,
            endTimestamp: Math.min(
              leg.boardingTime ?? endTimestamp,
              endTimestamp,
            ),
            notDisplayedReason: 'Vehicle has no polyline for boarding stop',
          });
          continue;
        }

        if (polyline.polyline.length === 0) {
          allAnimationData.push({
            status: passenger.status,
            startTimestamp: currentTimestamp,
            endTimestamp: Math.min(
              leg.boardingTime ?? endTimestamp,
              endTimestamp,
            ),
            notDisplayedReason:
              'Vehicle has an empty polyline for boarding stop',
          });
          continue;
        }

        const position =
          leg.boardingStopIndex === 0
            ? polyline.polyline[0]
            : polyline.polyline.slice(-1)[0];

        allAnimationData.push({
          status: passenger.status,
          startTimestamp: currentTimestamp,
          endTimestamp: Math.min(
            leg.boardingTime ?? endTimestamp,
            endTimestamp,
          ),
          position: position,
          notDisplayedReason: null,
        });

        currentTimestamp = Math.min(
          leg.boardingTime ?? endTimestamp,
          endTimestamp,
        );
      }

      if (
        leg.boardingTime !== null &&
        leg.boardingTime <= endTimestamp &&
        (leg.alightingTime === null || leg.alightingTime >= currentTimestamp)
      ) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: Math.max(leg.boardingTime, currentTimestamp),
          endTimestamp: Math.min(
            leg.alightingTime ?? endTimestamp,
            endTimestamp,
          ),
          vehicleId: leg.assignedVehicleId,
          notDisplayedReason: null,
        });

        currentTimestamp = Math.min(
          leg.alightingTime ?? endTimestamp,
          endTimestamp,
        );
      }

      if (leg.alightingTime === null || leg.alightingTime >= endTimestamp) {
        break;
      }

      if (leg.alightingStopIndex === null) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: Math.max(leg.alightingTime, currentTimestamp),
          endTimestamp: Math.min(leg.alightingTime, endTimestamp),
          notDisplayedReason: 'Leg has no alighting stop',
        });
        break;
      }

      const polyline = vehicle.polylines[leg.alightingStopIndex];

      if (polyline === undefined) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: Math.max(leg.alightingTime, currentTimestamp),
          endTimestamp: Math.min(leg.alightingTime, endTimestamp),
          notDisplayedReason: 'Vehicle has no polyline for alighting stop',
        });
        break;
      }

      if (polyline.polyline.length === 0) {
        allAnimationData.push({
          status: passenger.status,
          startTimestamp: Math.max(leg.alightingTime, currentTimestamp),
          endTimestamp: Math.min(leg.alightingTime, endTimestamp),
          notDisplayedReason:
            'Vehicle has an empty polyline for alighting stop',
        });
        break;
      }

      const position = polyline.polyline[0];

      allAnimationData.push({
        status: passenger.status,
        startTimestamp: Math.max(leg.alightingTime, currentTimestamp),
        endTimestamp: Math.min(
          allLegs[legIndex + 1]?.assignedTime ?? endTimestamp,
          endTimestamp,
        ),
        position: position,
        notDisplayedReason: null,
      });

      currentTimestamp = Math.min(
        allLegs[legIndex + 1]?.assignedTime ?? endTimestamp,
        endTimestamp,
      );
    }

    // Fill the gaps with previous or next position
    const length = allAnimationData.length;
    for (let i = 0; i < length - 1; i++) {
      const currentData = allAnimationData[i];
      const nextData = allAnimationData[i + 1];

      if (
        currentData.endTimestamp < nextData.startTimestamp &&
        currentData.endTimestamp < endTimestamp
      ) {
        const position =
          (currentData as StaticPassengerAnimationData).position ??
          (nextData as StaticPassengerAnimationData).position ??
          null;

        const newData: AnyPassengerAnimationData = {
          status: passenger.status,
          startTimestamp: currentData.endTimestamp,
          endTimestamp: nextData.startTimestamp,
          notDisplayedReason: 'Passenger has no position',
        };

        if (position !== null) {
          (newData as StaticPassengerAnimationData).position = position;
        }

        allAnimationData.push(newData);
      }
    }

    const allSortedAnimationData = allAnimationData.sort(
      (a, b) => a.startTimestamp - b.startTimestamp,
    );

    const previousAnimationData = structuredClone(allSortedAnimationData);

    // Set status according to updates
    for (const animationData of allSortedAnimationData) {
      animationData.status =
        statusUpdates.find(
          (update) =>
            update.timestamp >= animationData.startTimestamp &&
            update.timestamp <= animationData.endTimestamp,
        )?.status ?? passenger.status;
    }

    // Add other status updates
    let currentIndex = 0;
    for (const statusUpdate of statusUpdates) {
      while (
        currentIndex < allSortedAnimationData.length &&
        (allSortedAnimationData[currentIndex].endTimestamp <
          statusUpdate.timestamp ||
          (currentIndex + 1 < allSortedAnimationData.length &&
            allSortedAnimationData[currentIndex].startTimestamp ===
              allSortedAnimationData[currentIndex + 1].startTimestamp))
      ) {
        currentIndex++;
      }

      if (currentIndex >= allSortedAnimationData.length) {
        break;
      }

      const currentAnimationData = allSortedAnimationData[currentIndex];

      if (currentAnimationData.startTimestamp > statusUpdate.timestamp) {
        continue;
      }

      if (currentAnimationData.startTimestamp === statusUpdate.timestamp) {
        currentAnimationData.status = statusUpdate.status;
      } else {
        currentAnimationData.endTimestamp = statusUpdate.timestamp;
        allSortedAnimationData.splice(currentIndex + 1, 0, {
          ...currentAnimationData,
          status: statusUpdate.status,
          startTimestamp: statusUpdate.timestamp,
        });
        currentIndex++;
      }
    }

    // Verify the order of the timestamps
    for (let i = 0; i < allSortedAnimationData.length - 1; i++) {
      if (
        allSortedAnimationData[i].endTimestamp >
        allSortedAnimationData[i + 1].startTimestamp
      ) {
        console.error(
          'Invalid timestamps for vehicle:',
          allSortedAnimationData,
          i,
          allSortedAnimationData[i],
          i + 1,
          allSortedAnimationData[i + 1],
          passenger,
          previousAnimationData,
          statusUpdates,
          startTimestamp,
          endTimestamp,
        );
      }
    }

    return {
      ...passenger,
      animationData: allSortedAnimationData,
    };
  }

  private getVehicleAnimationDataFromVehicle(
    vehicle: Vehicle,
    startTimestamp: number,
    endTimestamp: number,
    statusUpdates: {
      status: VehicleStatus;
      timestamp: number;
    }[],
  ): AnimatedVehicle {
    const allStops = vehicle.previousStops.concat(
      vehicle.currentStop === null ? [] : [vehicle.currentStop],
      vehicle.nextStops,
    );

    // remove duplicated stops
    const uniqueStops: Stop[] = [];
    for (const stop of allStops) {
      if (
        uniqueStops.find(
          (otherStop) => otherStop.arrivalTime === stop.arrivalTime,
        ) === undefined
      ) {
        if (
          stop.departureTime === null &&
          allStops.find(
            (otherStop) =>
              otherStop.arrivalTime === stop.arrivalTime &&
              otherStop.departureTime !== null,
          ) !== undefined
        ) {
          continue;
        }

        uniqueStops.push(stop);
      }
    }

    const allAnimationData: AnyVehicleAnimationData[] = [];

    if (uniqueStops.length === 0) {
      allAnimationData.push({
        status: vehicle.status,
        startTimestamp: startTimestamp,
        endTimestamp: endTimestamp,
        notDisplayedReason: 'Vehicle has no stops',
      });
    } else if (vehicle.polylines === null) {
      allAnimationData.push({
        status: vehicle.status,
        startTimestamp: startTimestamp,
        endTimestamp: endTimestamp,
        notDisplayedReason: 'Vehicle has no polylines',
      });
    } else {
      for (let stopIndex = 0; stopIndex < uniqueStops.length - 1; stopIndex++) {
        const departingStop = uniqueStops[stopIndex];

        if (
          departingStop.arrivalTime <= endTimestamp &&
          (departingStop.departureTime === null ||
            departingStop.departureTime >= startTimestamp)
        ) {
          const currentPositionPolyline =
            vehicle.polylines[Math.max(stopIndex - 1, 0)];

          if (currentPositionPolyline === undefined) {
            allAnimationData.push({
              status: vehicle.status,
              startTimestamp: Math.max(
                startTimestamp,
                departingStop.arrivalTime,
              ),
              endTimestamp: Math.min(
                departingStop.departureTime ?? endTimestamp,
                endTimestamp,
              ),
              notDisplayedReason:
                'Vehicle has no polyline for current position',
            });
            continue;
          }

          if (currentPositionPolyline.polyline.length === 0) {
            allAnimationData.push({
              status: vehicle.status,
              startTimestamp: Math.max(
                startTimestamp,
                departingStop.arrivalTime,
              ),
              endTimestamp: Math.min(
                departingStop.departureTime ?? endTimestamp,
                endTimestamp,
              ),
              notDisplayedReason:
                'Vehicle has an empty polyline for current position',
            });
            continue;
          }

          const currentPosition =
            stopIndex === 0
              ? currentPositionPolyline.polyline[0]
              : currentPositionPolyline.polyline.slice(-1)[0];

          allAnimationData.push({
            status: vehicle.status,
            startTimestamp: Math.max(startTimestamp, departingStop.arrivalTime),
            endTimestamp: Math.min(
              departingStop.departureTime ?? endTimestamp,
              endTimestamp,
            ),
            position: currentPosition,
            polylineIndex: stopIndex - 1,
            notDisplayedReason: null,
          });
        }

        if (departingStop.departureTime === null) {
          break;
        }

        const arrivingStop = uniqueStops[stopIndex + 1];

        if (
          arrivingStop !== undefined &&
          arrivingStop.arrivalTime >= startTimestamp &&
          departingStop.departureTime <= endTimestamp
        ) {
          const polylineBetweenStops = vehicle.polylines[stopIndex];

          if (polylineBetweenStops === undefined) {
            allAnimationData.push({
              status: vehicle.status,
              startTimestamp: Math.max(
                startTimestamp,
                departingStop.arrivalTime,
              ),
              endTimestamp: Math.min(arrivingStop.arrivalTime, endTimestamp),
              notDisplayedReason:
                'Vehicle has no polyline between departing and arriving stop',
            });
            continue;
          }

          if (polylineBetweenStops.polyline.length === 0) {
            allAnimationData.push({
              status: vehicle.status,
              startTimestamp: Math.max(
                startTimestamp,
                departingStop.arrivalTime,
              ),
              endTimestamp: Math.min(arrivingStop.arrivalTime, endTimestamp),
              notDisplayedReason:
                'Vehicle has an empty polyline between departing and arriving stop',
            });
            continue;
          }

          allAnimationData.push({
            status: vehicle.status,
            startTimestamp: Math.max(
              startTimestamp,
              departingStop.departureTime,
            ),
            endTimestamp: Math.min(arrivingStop.arrivalTime, endTimestamp),
            polyline: polylineBetweenStops,
            polylineIndex: stopIndex,
            notDisplayedReason: null,
          });
        }
      }
    }

    // Fill the gaps with previous or next position
    const length = allAnimationData.length;
    for (let i = 0; i < length - 1; i++) {
      const currentData = allAnimationData[i];
      const nextData = allAnimationData[i + 1];

      if (
        currentData.endTimestamp < nextData.startTimestamp &&
        currentData.endTimestamp < endTimestamp
      ) {
        const position =
          (currentData as StaticVehicleAnimationData).position ??
          (nextData as StaticVehicleAnimationData).position ??
          (currentData as DynamicVehicleAnimationData).polyline?.polyline.slice(
            -1,
          )[0] ??
          (nextData as DynamicVehicleAnimationData).polyline?.polyline[0] ??
          null;

        const newData: AnyVehicleAnimationData = {
          status: vehicle.status,
          startTimestamp: currentData.endTimestamp,
          endTimestamp: nextData.startTimestamp,
          notDisplayedReason: 'Vehicle has no position',
        };

        if (position !== null) {
          (newData as StaticVehicleAnimationData).position = position;
        }

        allAnimationData.push(newData);
      }
    }

    const allSortedAnimationData = allAnimationData.sort(
      (a, b) => a.startTimestamp - b.startTimestamp,
    );

    const previousAnimationData = structuredClone(allSortedAnimationData);

    // Set status according to updates
    for (const animationData of allSortedAnimationData) {
      animationData.status =
        statusUpdates.find(
          (update) =>
            update.timestamp >= animationData.startTimestamp &&
            update.timestamp <= animationData.endTimestamp,
        )?.status ?? vehicle.status;
    }

    // Add other status updates
    let currentIndex = 0;
    for (const statusUpdate of statusUpdates) {
      while (
        currentIndex < allSortedAnimationData.length &&
        (allSortedAnimationData[currentIndex].endTimestamp <
          statusUpdate.timestamp ||
          (currentIndex + 1 < allSortedAnimationData.length &&
            allSortedAnimationData[currentIndex].startTimestamp ===
              allSortedAnimationData[currentIndex + 1].startTimestamp))
      ) {
        currentIndex++;
      }

      if (currentIndex >= allSortedAnimationData.length) {
        break;
      }

      const currentAnimationData = allSortedAnimationData[currentIndex];

      if (currentAnimationData.startTimestamp > statusUpdate.timestamp) {
        continue;
      }

      if (currentAnimationData.startTimestamp === statusUpdate.timestamp) {
        currentAnimationData.status = statusUpdate.status;
      } else {
        currentAnimationData.endTimestamp = statusUpdate.timestamp;
        allSortedAnimationData.splice(currentIndex + 1, 0, {
          ...currentAnimationData,
          status: statusUpdate.status,
          startTimestamp: statusUpdate.timestamp,
        });
        currentIndex++;
      }
    }

    // Verify the order of the timestamps
    for (let i = 0; i < allSortedAnimationData.length - 1; i++) {
      if (
        allSortedAnimationData[i].endTimestamp >
        allSortedAnimationData[i + 1].startTimestamp
      ) {
        console.error(
          'Invalid timestamps for vehicle:',
          allSortedAnimationData,
          i,
          allSortedAnimationData[i],
          i + 1,
          allSortedAnimationData[i + 1],
          vehicle,
          previousAnimationData,
          statusUpdates,
          startTimestamp,
          endTimestamp,
        );
      }
    }

    return {
      ...vehicle,
      animationData: allSortedAnimationData,
    };
  }
}

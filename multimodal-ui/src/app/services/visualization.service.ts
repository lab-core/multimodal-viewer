import {
  computed,
  effect,
  Injectable,
  Injector,
  runInInjectionContext,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  AnimatedLeg,
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedSimulationStates,
  AnimatedStop,
  AnimatedVehicle,
  AnimationData,
  DynamicPassengerAnimationData,
  getAllStops,
  Leg,
  RUNNING_SIMULATION_STATUSES,
  Simulation,
  SimulationEnvironment,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
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
    computed(() => this.computeWantedVisualizationTime());

  private animatedSimulationEnvironment: AnimatedSimulationEnvironment | null =
    null;

  readonly visualizationEnvironmentSignal: Signal<AnimatedSimulationEnvironment | null> =
    computed(() => this.computeAnimatedSimulationEnvironment());

  private readonly _isLoadingSignal: WritableSignal<boolean> = signal(true);

  // MARK: Constructor
  constructor(
    private readonly injector: Injector,
    private readonly communicationService: CommunicationService,
    private readonly simulationService: SimulationService,
  ) {
    effect(() => {
      const wantedVisualizationTime = this._wantedVisualizationTimeSignal();
      this.wantedVisualizationTime = wantedVisualizationTime;
    });

    effect(() => {
      const simulation = this.simulationService.activeSimulationSignal();

      if (simulation === null) {
        this._isLoadingSignal.set(true);
        return;
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

      // const hasCurrentStateShifted =
      //   simulationStates.currentState === null ||
      //   wantedVisualizationTime <
      //     simulationStates.currentState.startTimestamp ||
      //   wantedVisualizationTime > simulationStates.currentState.endTimestamp;

      if (
        isCurrentStateAvailable &&
        !simulationStates.shouldRequestMoreStates
        // &&
        // !hasCurrentStateShifted
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

    this.initializeAutoSave();
    this.initializeAutoLoad();
  }

  // MARK: Local Storage
  private initializeAutoSave(): void {
    window.addEventListener('beforeunload', () => {
      this.saveLocalStorageData();
    });
  }

  private saveLocalStorageData(): void {
    const wantedVisualizationTime = this._wantedVisualizationTimeSignal();
    const isVisualizationPaused = this._isVisualizationPausedSignal();

    if (wantedVisualizationTime !== null) {
      localStorage.setItem(
        'wantedVisualizationTime',
        wantedVisualizationTime.toString(),
      );
    }
    localStorage.setItem(
      'isVisualizationPaused',
      JSON.stringify(isVisualizationPaused),
    );
  }

  private initializeAutoLoad(): void {
    window.addEventListener('load', () => {
      this.loadWantedVisualizationTime();
    });
  }

  private loadWantedVisualizationTime(): void {
    const savedWantedVisualizationTime = localStorage.getItem(
      'wantedVisualizationTime',
    );
    const savedIsVisualizationPaused = localStorage.getItem(
      'isVisualizationPaused',
    );

    if (savedWantedVisualizationTime) {
      const time = parseFloat(savedWantedVisualizationTime);
      if (!isNaN(time)) {
        this.wantedVisualizationTime = time;
        this.visualizationTimeOverrideSignal.set(time);
      }
    }

    if (savedIsVisualizationPaused !== null) {
      const isPaused = JSON.parse(savedIsVisualizationPaused) as boolean;
      this._isVisualizationPausedSignal.set(isPaused);
    }
  }

  public clearLocalStorage(): void {
    localStorage.removeItem('wantedVisualizationTime');
    localStorage.removeItem('isVisualizationPaused');
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
    this.clearLocalStorage();

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

    this.timeout = setTimeout(
      () => {
        this.updateTick();
      },
      1000 / Math.abs(this.speed),
    ) as unknown as number;
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

  // MARK: Computed signals
  private computeWantedVisualizationTime(): number | null {
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
      return Math.max(
        Math.min(visualizationMaxTime, visualizationTimeOverride),
        simulationStartTime,
      );
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

    return Math.min(
      visualizationMaxTime,
      Math.max(
        this.wantedVisualizationTime + 1 * Math.sign(this.speed),
        simulationStartTime,
      ),
    );
  }

  private computeAnimatedSimulationEnvironment(): AnimatedSimulationEnvironment | null {
    const simulationStates = this.simulationService.simulationStatesSignal();

    if (
      simulationStates.firstContinuousState === null ||
      simulationStates.lastContinuousState === null ||
      simulationStates.continuousAnimationData === null
    ) {
      return null;
    }

    const continuousStates = simulationStates.states.slice(
      simulationStates.firstContinuousState.index,
      simulationStates.lastContinuousState.index + 1,
    );

    const continuousAnimatedStates: AnimatedSimulationStates = {
      ...simulationStates,
      states: continuousStates,
    };

    if (continuousStates.length === 0) {
      return null;
    }

    const environment = this.buildEnvironment(continuousAnimatedStates);

    if (environment === null) {
      return this.animatedSimulationEnvironment;
    }

    const animatedEnvironment = this.completeEnvironment(
      environment,
      simulationStates.continuousAnimationData,
    );

    this.animatedSimulationEnvironment = animatedEnvironment;

    return animatedEnvironment;
  }

  private buildEnvironment(
    simulationStates: AnimatedSimulationStates,
  ): SimulationEnvironment | null {
    const wantedVisualizationTime = this._wantedVisualizationTimeSignal();

    if (wantedVisualizationTime === null) {
      return null;
    }

    if (
      simulationStates.firstContinuousState === null ||
      simulationStates.lastContinuousState === null ||
      simulationStates.currentState === null
    ) {
      return null;
    }

    if (
      wantedVisualizationTime <
        simulationStates.firstContinuousState.timestamp ||
      wantedVisualizationTime > simulationStates.lastContinuousState.timestamp
    ) {
      return null;
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

    const environment = this.simulationService.buildEnvironment(
      {
        ...state,
        passengers: { ...state.passengers },
        vehicles: { ...state.vehicles },
      },
      wantedVisualizationTime,
    );

    environment.timestamp = wantedVisualizationTime;

    return {
      ...environment,
    };
  }

  private completeEnvironment(
    environment: SimulationEnvironment,
    animationData: AnimationData,
  ): AnimatedSimulationEnvironment {
    const stops: Record<string, AnimatedStop> = {};
    for (const vehicle of Object.values(environment.vehicles)) {
      const vehicleStops = getAllStops(vehicle);
      for (const stop of vehicleStops) {
        if (stops[stop.id] === undefined) {
          stops[stop.id] = {
            ...stop,
            passengerIds: [],
            vehicleIds: [],
            numberOfPassengers: 0,
            numberOfCompletePassengers: 0,
          };
        }
      }
    }

    const vehicles: Record<string, AnimatedVehicle> = {};
    for (const vehicleId of Object.keys(environment.vehicles)) {
      const vehicle = environment.vehicles[vehicleId];
      const vehicleAnimationData = animationData.vehicles[vehicleId];

      if (vehicleAnimationData === undefined) {
        console.error(
          'Vehicle animation data not found',
          vehicle,
          environment,
          animationData,
        );
        continue;
      }

      const currentAnimationData = vehicleAnimationData.find(
        (data) =>
          data.startTimestamp <= environment.timestamp &&
          data.endTimestamp! >= environment.timestamp,
      );

      vehicles[vehicleId] = {
        ...vehicle,
        animationData: vehicleAnimationData,
        notDisplayedReason: currentAnimationData?.notDisplayedReason ?? null,
        passengerIds: [],
        numberOfPassengers: 0,
        currentLineIndex: null,
      };

      if (currentAnimationData === undefined) {
        continue;
      }

      if (
        (currentAnimationData as StaticVehicleAnimationData).position !==
        undefined
      ) {
        const staticAnimationData =
          currentAnimationData as StaticVehicleAnimationData;
        const stopId = staticAnimationData.stopId;

        const stop = stops[stopId];

        if (stop === undefined) {
          console.error('Stop not found for vehicle');
          continue;
        }

        stop.vehicleIds.push(vehicleId);
      }
    }

    const passengers: Record<string, AnimatedPassenger> = {};
    for (const passengerId of Object.keys(environment.passengers)) {
      const passenger = environment.passengers[passengerId];
      const passengerAnimationData = animationData.passengers[passengerId];

      if (passengerAnimationData === undefined) {
        console.error('Passenger animation data not found');
        continue;
      }

      const currentAnimationData = passengerAnimationData.find(
        (data) =>
          data.startTimestamp <= environment.timestamp &&
          data.endTimestamp! >= environment.timestamp,
      );

      passengers[passengerId] = {
        ...passenger,
        previousLegs: passenger.previousLegs.map((leg) =>
          this.buildAnimatedLeg(leg, vehicles),
        ),
        currentLeg:
          passenger.currentLeg === null
            ? null
            : this.buildAnimatedLeg(passenger.currentLeg, vehicles),
        nextLegs: passenger.nextLegs.map((leg) =>
          this.buildAnimatedLeg(leg, vehicles),
        ),
        animationData: passengerAnimationData,
        notDisplayedReason: currentAnimationData?.notDisplayedReason ?? null,
      };

      if (
        currentAnimationData === undefined ||
        currentAnimationData.vehicleId === null
      ) {
        continue;
      }

      const vehicle = vehicles[currentAnimationData.vehicleId];

      if (vehicle === undefined) {
        console.error('Vehicle not found for passenger');
        continue;
      }

      if ((currentAnimationData as DynamicPassengerAnimationData).isOnBoard) {
        vehicle.passengerIds.push(passengerId);
        vehicle.numberOfPassengers += passenger.numberOfPassengers;
      } else if (
        (currentAnimationData as StaticPassengerAnimationData).stopIndex !==
        undefined
      ) {
        const allStops = getAllStops(vehicle);
        const staticAnimationData =
          currentAnimationData as StaticPassengerAnimationData;

        const stop = allStops[staticAnimationData.stopIndex];

        if (stop === undefined) {
          console.error('Stop not found for passenger');
          continue;
        }

        const animatedStop = stops[stop.id];

        if (animatedStop === undefined) {
          console.error('Animated stop not found for passenger');
          continue;
        }

        animatedStop.passengerIds.push(passengerId);

        if (passenger.status === 'complete') {
          animatedStop.numberOfCompletePassengers +=
            passenger.numberOfPassengers;
        } else {
          animatedStop.numberOfPassengers += passenger.numberOfPassengers;
        }
      }
    }

    return {
      ...environment,
      passengers,
      vehicles,
      stops,
      animationData,
    };
  }

  private buildAnimatedLeg(
    leg: Leg,
    vehicles: Record<string, AnimatedVehicle>,
  ): AnimatedLeg {
    const animatedLeg: AnimatedLeg = {
      ...leg,
      previousStops: [],
      currentStop: null,
      nextStops: [],
    };

    if (
      leg.assignedVehicleId === null ||
      leg.boardingStopIndex === null ||
      leg.alightingStopIndex === null
    ) {
      return animatedLeg;
    }

    const vehicle = vehicles[leg.assignedVehicleId];

    if (vehicle === undefined) {
      return animatedLeg;
    }

    const allStops = getAllStops(vehicle);

    const legStops = allStops.slice(
      leg.boardingStopIndex,
      leg.alightingStopIndex + 1,
    );

    animatedLeg.previousStops = legStops.filter(
      (stop) => stop.type === 'previous',
    );
    animatedLeg.currentStop =
      legStops.find((stop) => stop.type === 'current') ?? null;
    animatedLeg.nextStops = legStops.filter((stop) => stop.type === 'next');
    return animatedLeg;
  }
}

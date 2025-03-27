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
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedVehicle,
  AnyPassengerAnimationData,
  AnySimulationUpdate,
  AnyVehicleAnimationData,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  getAllStops,
  Passenger,
  PassengerAnimationData,
  Polyline,
  RUNNING_SIMULATION_STATUSES,
  Simulation,
  SimulationEnvironment,
  SimulationState,
  SimulationUpdate,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  Stop,
  Vehicle,
  VehicleAnimationData,
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

      return Math.min(
        visualizationMaxTime,
        Math.max(
          this.wantedVisualizationTime + 1 * Math.sign(this.speed),
          simulationStartTime,
        ),
      );
    });

  // MARK: +- Visualization Environment
  private currentVisualizationEnvironment: SimulationEnvironment | null = null;
  readonly currentVisualizationEnvironmentSignal: Signal<SimulationEnvironment | null> =
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
        return this.currentVisualizationEnvironment;
      }

      if (
        simulationStates.firstContinuousState === null ||
        simulationStates.lastContinuousState === null ||
        simulationStates.currentState === null
      ) {
        return this.currentVisualizationEnvironment;
      }

      if (
        wantedVisualizationTime <
          simulationStates.firstContinuousState.timestamp ||
        wantedVisualizationTime > simulationStates.lastContinuousState.timestamp
      ) {
        return this.currentVisualizationEnvironment;
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
        structuredClone(state),
        wantedVisualizationTime,
      );

      environment.timestamp = wantedVisualizationTime;

      this.currentVisualizationEnvironment = environment;

      return environment;
    });

  // MARK: +- Animated
  private animatedSimulationEnvironment: AnimatedSimulationEnvironment | null =
    null;
  private readonly animatedSimulationEnvironmentSignal: Signal<AnimatedSimulationEnvironment | null> =
    computed(() => {
      const simulationStates = this.simulationService.simulationStatesSignal();
      const polylines =
        this.simulationService.simulationPolylinesSignal()
          ?.polylinesByCoordinates ?? null;

      if (
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

      const allUpdates = structuredClone(
        continuousStates.flatMap((state) => state.updates),
      );

      let animatedSimulationEnvironment: AnimatedSimulationEnvironment | null =
        null;

      // TODO Optimisations have bugs so disabled for now
      // const canExtendAnimationData =
      //   this.animatedSimulationEnvironment !== null &&
      //   this.animatedSimulationEnvironment.animationData.endOrder >=
      //     simulationStates.firstContinuousState.order &&
      //   this.animatedSimulationEnvironment.animationData.startOrder <=
      //     simulationStates.lastContinuousState.order;

      // if (canExtendAnimationData) {
      //   animatedSimulationEnvironment = this.cropAnimationData(
      //     this.animatedSimulationEnvironment!,
      //     simulationStates.firstContinuousState.timestamp,
      //     simulationStates.firstContinuousState.order,
      //     simulationStates.lastContinuousState.timestamp,
      //     simulationStates.lastContinuousState.order,
      //     continuousStates.slice(-1)[0],
      //   );

      //   const updatesBefore = allUpdates.filter(
      //     (update) =>
      //       update.order <
      //       animatedSimulationEnvironment!.animationData.startOrder,
      //   );
      //   const updatesAfter = allUpdates.filter(
      //     (update) =>
      //       update.order >
      //       animatedSimulationEnvironment!.animationData.endOrder,
      //   );

      //   if (updatesBefore.length > 0) {
      //     const { updates: _updates, ...initialEnvironment } =
      //       continuousStates[0];
      //     const initialEnvironmentClone: SimulationEnvironment =
      //       structuredClone(initialEnvironment);

      //     animatedSimulationEnvironment = this.mergeAnimationData(
      //       this.getAnimationData(
      //         initialEnvironmentClone,
      //         updatesBefore,
      //         polylines,
      //       ),
      //       animatedSimulationEnvironment,
      //     );
      //   }

      //   if (updatesAfter.length > 0) {
      //     const initialEnvironment = animatedSimulationEnvironment.finalState;

      //     animatedSimulationEnvironment = this.mergeAnimationData(
      //       animatedSimulationEnvironment,
      //       this.getAnimationData(initialEnvironment, updatesAfter, polylines),
      //     );
      //   }
      // } else {
      const { updates: _updates, ...initialEnvironment } = continuousStates[0];
      const initialEnvironmentClone: SimulationEnvironment =
        structuredClone(initialEnvironment);

      animatedSimulationEnvironment = this.getAnimationData(
        initialEnvironmentClone,
        allUpdates,
        polylines,
      );
      // }

      this.animatedSimulationEnvironment = animatedSimulationEnvironment;

      return animatedSimulationEnvironment;
    });

  readonly visualizationEnvironmentSignal: Signal<AnimatedSimulationEnvironment | null> =
    computed(() => {
      const environment = this.currentVisualizationEnvironmentSignal();
      const animatedEnvironment = this.animatedSimulationEnvironmentSignal();

      if (environment === null || animatedEnvironment === null) {
        return null;
      }

      const passengers: Record<string, AnimatedPassenger> = {};
      for (const passengerId of Object.keys(environment.passengers)) {
        const passenger = environment.passengers[passengerId];
        const animationData =
          animatedEnvironment.animationData.passengers[passengerId];

        const currentAnimationData = animationData.find(
          (data) =>
            data.startTimestamp <= environment.timestamp &&
            data.endTimestamp! >= environment.timestamp,
        );

        passengers[passengerId] = {
          ...passenger,
          animationData,
          notDisplayedReason: currentAnimationData?.notDisplayedReason ?? null,
        };
      }

      const vehicles: Record<string, AnimatedVehicle> = {};
      for (const vehicleId of Object.keys(environment.vehicles)) {
        const vehicle = environment.vehicles[vehicleId];
        const animationData =
          animatedEnvironment.animationData.vehicles[vehicleId];

        const currentAnimationData = animationData.find(
          (data) =>
            data.startTimestamp <= environment.timestamp &&
            data.endTimestamp! >= environment.timestamp,
        );

        vehicles[vehicleId] = {
          ...vehicle,
          animationData,
          notDisplayedReason: currentAnimationData?.notDisplayedReason ?? null,
        };
      }

      return {
        ...animatedEnvironment,
        currentState: {
          ...environment,
          passengers,
          vehicles,
        },
      };
    });

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

  private getAnimationData(
    initialEnvironment: SimulationEnvironment,
    updates: AnySimulationUpdate[],
    polylines: Record<string, Polyline> | null,
  ): AnimatedSimulationEnvironment {
    const animatedSimulationEnvironment = this.createInitialAnimationData(
      initialEnvironment,
      polylines,
    );

    for (const update of updates) {
      this.simulationService.applyUpdate(
        update,
        animatedSimulationEnvironment.finalState,
      );
      animatedSimulationEnvironment.animationData.endOrder = update.order;
      animatedSimulationEnvironment.animationData.endTimestamp =
        update.timestamp;

      switch (update.type) {
        case 'createPassenger':
          {
            const castedUpdate = update as SimulationUpdate<'createPassenger'>;
            this.handleCreatePassenger(
              animatedSimulationEnvironment,
              castedUpdate,
            );
          }
          break;
        case 'updatePassengerStatus':
          {
            const castedUpdate =
              update as SimulationUpdate<'updatePassengerStatus'>;
            this.handleUpdatePassengerStatus(
              animatedSimulationEnvironment,
              castedUpdate,
            );
          }
          break;
        case 'updatePassengerLegs':
          {
            const castedUpdate =
              update as SimulationUpdate<'updatePassengerLegs'>;
            this.handleUpdatePassengerLegs(
              animatedSimulationEnvironment,
              castedUpdate,
            );
          }
          break;
        case 'createVehicle':
          {
            const castedUpdate = update as SimulationUpdate<'createVehicle'>;
            this.handleCreateVehicle(
              animatedSimulationEnvironment,
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
              animatedSimulationEnvironment,
              castedUpdate,
            );
          }
          break;
        case 'updateVehicleStops':
          {
            const castedUpdate =
              update as SimulationUpdate<'updateVehicleStops'>;
            this.handleUpdateVehicleStops(
              animatedSimulationEnvironment,
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

    this.updateEndTimestamps(animatedSimulationEnvironment);

    return animatedSimulationEnvironment;
  }

  private createInitialAnimationData(
    initialEnvironment: SimulationEnvironment,
    polylines: Record<string, Polyline> | null,
  ): AnimatedSimulationEnvironment {
    const animatedSimulationEnvironment: AnimatedSimulationEnvironment = {
      finalState: initialEnvironment,
      currentState: null as unknown as SimulationEnvironment & {
        passengers: Record<string, AnimatedPassenger>;
        vehicles: Record<string, AnimatedVehicle>;
      }, // Will be overwritten
      animationData: {
        passengers: {},
        vehicles: {},
        startTimestamp: initialEnvironment.timestamp,
        startOrder: initialEnvironment.order,
        endTimestamp: initialEnvironment.timestamp,
        endOrder: initialEnvironment.order,
      },
    };

    for (const vehicle of Object.values(initialEnvironment.vehicles)) {
      animatedSimulationEnvironment.animationData.vehicles[vehicle.id] = [
        this.getVehicleAnimationDataFromVehicle(
          vehicle,
          polylines,
          initialEnvironment.timestamp,
          initialEnvironment.order,
        ),
      ];
    }

    for (const passenger of Object.values(initialEnvironment.passengers)) {
      animatedSimulationEnvironment.animationData.passengers[passenger.id] = [
        this.getPassengerAnimationDataFromPassenger(
          passenger,
          // animatedSimulationEnvironment.animationData.vehicles,
          initialEnvironment.timestamp,
          initialEnvironment.order,
          initialEnvironment.timestamp,
        ),
      ];
    }

    return animatedSimulationEnvironment;
  }

  private getPassengerAnimationDataFromPassenger(
    passenger: Passenger,
    // vehicles: Record<string, AnimatedVehicle>,
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

    if (passenger.currentLeg === null) {
      basicAnimationData.notDisplayedReason = 'Passenger has no current leg';
      return basicAnimationData;
    }

    if (
      passenger.currentLeg.assignedVehicleId === null ||
      passenger.currentLeg.assignedTime === null
    ) {
      basicAnimationData.notDisplayedReason = 'Leg has no assigned vehicle';
      return basicAnimationData;
    } else if (passenger.currentLeg.boardingStopIndex === null) {
      basicAnimationData.notDisplayedReason = 'Leg has no boarding stop';
      return basicAnimationData;
    } else if (passenger.currentLeg.alightingStopIndex === null) {
      basicAnimationData.notDisplayedReason = 'Leg has no alighting stop';
      return basicAnimationData;
    }

    basicAnimationData.vehicleId = passenger.currentLeg.assignedVehicleId;

    // const vehicle = vehicles[passenger.currentLeg.assignedVehicleId];

    // if (vehicle === undefined) {
    //   basicAnimationData.notDisplayedReason = 'Vehicle not found';
    //   return basicAnimationData;
    // }

    // const allStops = this.getAllStops(vehicle);

    // if (allStops.length < passenger.currentLeg.boardingStopIndex) {
    //   basicAnimationData.notDisplayedReason = 'Boarding stop not found';
    //   return basicAnimationData;
    // }

    // Is at the boarding stop
    if (
      passenger.currentLeg.boardingTime === null ||
      passenger.currentLeg.boardingTime > currentTimestamp
    ) {
      // const boardingStop = allStops[passenger.currentLeg.boardingStopIndex];
      const staticAnimationData: StaticPassengerAnimationData = {
        ...basicAnimationData,
        stopIndex: passenger.currentLeg.boardingStopIndex,
      };
      return staticAnimationData;
    }

    // Is between boarding and alighting stop
    if (
      passenger.currentLeg.alightingTime === null ||
      passenger.currentLeg.alightingTime > currentTimestamp
    ) {
      // if (
      //   vehicle.animationData === null ||
      //   vehicle.animationData.length === 0
      // ) {
      //   basicAnimationData.notDisplayedReason = 'Vehicle is not present';
      //   return basicAnimationData;
      // }

      // There is only one animation data
      // const vehicleAnimationData = vehicle.animationData[0];

      // if (vehicleAnimationData.notDisplayedReason !== null) {
      //   basicAnimationData.notDisplayedReason = 'Vehicle is not displayed';
      //   return basicAnimationData;
      // }

      const dynamicAnimationData: DynamicPassengerAnimationData = {
        ...basicAnimationData,
        isOnBoard: true,
      };

      return dynamicAnimationData;
    }

    // Is at the alighting stop
    // const alightingStop = allStops[passenger.currentLeg.alightingStopIndex];
    const staticAnimationData: StaticPassengerAnimationData = {
      ...basicAnimationData,
      stopIndex: passenger.currentLeg.alightingStopIndex,
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
      };

      return staticAnimationData;
    }

    // Vehicle is moving
    if (vehicle.previousStops.length > 0 && vehicle.nextStops.length > 0) {
      const stop = vehicle.previousStops.slice(-1)[0];
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
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    update: SimulationUpdate<'createPassenger'>,
  ): void {
    const passenger = update.data;

    animatedSimulationEnvironment.animationData.passengers[passenger.id] = [
      this.getPassengerAnimationDataFromPassenger(
        passenger,
        // animatedSimulationEnvironment.animationData.vehicles,
        animatedSimulationEnvironment.finalState.timestamp,
        animatedSimulationEnvironment.finalState.order,
        animatedSimulationEnvironment.finalState.timestamp,
      ),
    ];
  }

  private handleUpdatePassengerStatus(
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    update: SimulationUpdate<'updatePassengerStatus'>,
  ): void {
    const passengerId = update.data.id;
    const status = update.data.status;

    const passengerAnimationData =
      animatedSimulationEnvironment.animationData.passengers[passengerId];

    if (passengerAnimationData === undefined) {
      console.error('Passenger animation data not found');
      return;
    }

    const lastAnimationData = passengerAnimationData.slice(-1)[0];

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
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    update: SimulationUpdate<'updatePassengerLegs'>,
  ): void {
    const passengerId = update.data.id;

    const passengerAnimationData =
      animatedSimulationEnvironment.animationData.passengers[passengerId];

    if (passengerAnimationData === undefined) {
      console.error('Passenger animation data not found');
      return;
    }

    const passenger =
      animatedSimulationEnvironment.finalState.passengers[passengerId];

    const lastAnimationData = passengerAnimationData.slice(-1)[0];

    const newAnimationData = this.getPassengerAnimationDataFromPassenger(
      passenger,
      // animatedSimulationEnvironment.animationData.vehicles,
      update.timestamp,
      update.order,
      animatedSimulationEnvironment.finalState.timestamp,
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
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    update: SimulationUpdate<'createVehicle'>,
    polylines: Record<string, Polyline> | null,
  ): void {
    const vehicle = update.data;

    animatedSimulationEnvironment.animationData.vehicles[vehicle.id] = [
      this.getVehicleAnimationDataFromVehicle(
        vehicle,
        polylines,
        animatedSimulationEnvironment.finalState.timestamp,
        animatedSimulationEnvironment.finalState.order,
      ),
    ];
  }

  private handleUpdateVehicleStatus(
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    update: SimulationUpdate<'updateVehicleStatus'>,
  ): void {
    const vehicleId = update.data.id;
    const status = update.data.status;

    const vehicleAnimationData =
      animatedSimulationEnvironment.animationData.vehicles[vehicleId];

    if (vehicleAnimationData === undefined) {
      console.error('Vehicle animation data not found');
      return;
    }

    const lastAnimationData = vehicleAnimationData.slice(-1)[0];

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
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    update: SimulationUpdate<'updateVehicleStops'>,
    polylines: Record<string, Polyline> | null,
  ): void {
    const vehicleId = update.data.id;

    const vehicleAnimationData =
      animatedSimulationEnvironment.animationData.vehicles[vehicleId];

    if (vehicleAnimationData === undefined) {
      console.error('Vehicle animation data not found');
      return;
    }

    const vehicle =
      animatedSimulationEnvironment.finalState.vehicles[vehicleId];

    const lastAnimationData = vehicleAnimationData.slice(-1)[0];

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

  private mergeAnimationData(
    firstAnimatedSimulationEnvironment: AnimatedSimulationEnvironment,
    secondAnimatedSimulationEnvironment: AnimatedSimulationEnvironment,
  ): AnimatedSimulationEnvironment {
    const finalState = secondAnimatedSimulationEnvironment.finalState;

    const mergedPassengerAnimationData: Record<
      string,
      PassengerAnimationData[]
    > = {};

    for (const passengerId of Object.keys(
      firstAnimatedSimulationEnvironment.animationData.passengers,
    )) {
      const firstPassengerAnimationData =
        firstAnimatedSimulationEnvironment.animationData.passengers[
          passengerId
        ];
      const secondPassengerAnimationData =
        secondAnimatedSimulationEnvironment.animationData.passengers[
          passengerId
        ];

      const firstHasAnimationData =
        firstPassengerAnimationData !== undefined &&
        firstPassengerAnimationData.length > 0;
      const secondHasAnimationData =
        secondPassengerAnimationData !== undefined &&
        secondPassengerAnimationData.length > 0;

      if (!firstHasAnimationData && !secondHasAnimationData) {
        continue;
      }

      if (!firstHasAnimationData) {
        mergedPassengerAnimationData[passengerId] =
          secondPassengerAnimationData;
        continue;
      }

      if (!secondHasAnimationData) {
        mergedPassengerAnimationData[passengerId] = firstPassengerAnimationData;
        continue;
      }

      const lastFirstAnimationData = firstPassengerAnimationData.slice(-1)[0];
      const firstSecondAnimationData = secondPassengerAnimationData[0];

      const {
        startOrder: _1,
        startTimestamp: _2,
        endOrder: _3,
        endTimestamp: _4,
        ...firstComparableData
      } = lastFirstAnimationData;
      const {
        startOrder: _5,
        startTimestamp: _6,
        endOrder: _7,
        endTimestamp: _8,
        ...secondComparableData
      } = firstSecondAnimationData;

      if (
        JSON.stringify(firstComparableData) !==
        JSON.stringify(secondComparableData)
      ) {
        mergedPassengerAnimationData[passengerId] =
          firstPassengerAnimationData.concat(secondPassengerAnimationData);
        continue;
      } else {
        mergedPassengerAnimationData[passengerId] = firstPassengerAnimationData
          .slice(0, -1)
          .concat(secondPassengerAnimationData);
        firstSecondAnimationData.startOrder = lastFirstAnimationData.startOrder;
        firstSecondAnimationData.startTimestamp =
          lastFirstAnimationData.startTimestamp;
      }
    }

    const mergedVehicleAnimationData: Record<string, VehicleAnimationData[]> =
      {};

    for (const vehicleId of Object.keys(
      firstAnimatedSimulationEnvironment.animationData.vehicles,
    )) {
      const firstVehicleAnimationData =
        firstAnimatedSimulationEnvironment.animationData.vehicles[vehicleId];
      const secondVehicleAnimationData =
        secondAnimatedSimulationEnvironment.animationData.vehicles[vehicleId];

      const firstHasAnimationData =
        firstVehicleAnimationData !== undefined &&
        firstVehicleAnimationData.length > 0;
      const secondHasAnimationData =
        secondVehicleAnimationData !== undefined &&
        secondVehicleAnimationData.length > 0;

      if (!firstHasAnimationData && !secondHasAnimationData) {
        continue;
      }

      if (!firstHasAnimationData) {
        mergedVehicleAnimationData[vehicleId] = secondVehicleAnimationData;
        continue;
      }

      if (!secondHasAnimationData) {
        mergedVehicleAnimationData[vehicleId] = firstVehicleAnimationData;
        continue;
      }

      const lastFirstAnimationData = firstVehicleAnimationData.slice(-1)[0];
      const firstSecondAnimationData = secondVehicleAnimationData[0];

      const {
        startOrder: _1,
        startTimestamp: _2,
        endOrder: _3,
        endTimestamp: _4,
        ...firstComparableData
      } = lastFirstAnimationData;
      const {
        startOrder: _5,
        startTimestamp: _6,
        endOrder: _7,
        endTimestamp: _8,
        ...secondComparableData
      } = firstSecondAnimationData;

      if (
        JSON.stringify(firstComparableData) !==
        JSON.stringify(secondComparableData)
      ) {
        mergedVehicleAnimationData[vehicleId] =
          firstVehicleAnimationData.concat(secondVehicleAnimationData);
        continue;
      } else {
        mergedVehicleAnimationData[vehicleId] = firstVehicleAnimationData
          .slice(0, -1)
          .concat(secondVehicleAnimationData);
        firstSecondAnimationData.startOrder = lastFirstAnimationData.startOrder;
        firstSecondAnimationData.startTimestamp =
          lastFirstAnimationData.startTimestamp;
      }
    }

    return {
      ...secondAnimatedSimulationEnvironment,
      finalState,
      animationData: {
        passengers: mergedPassengerAnimationData,
        vehicles: mergedVehicleAnimationData,
        startTimestamp:
          firstAnimatedSimulationEnvironment.animationData.startTimestamp,
        startOrder: firstAnimatedSimulationEnvironment.animationData.startOrder,
        endTimestamp:
          secondAnimatedSimulationEnvironment.animationData.endTimestamp,
        endOrder: secondAnimatedSimulationEnvironment.animationData.endOrder,
      },
    };
  }

  private cropAnimationData(
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    newStartTimestamp: number,
    newStartOrder: number,
    newEndTimestamp: number,
    newEndOrder: number,
    lastContinuousState: SimulationState,
  ): AnimatedSimulationEnvironment {
    let finalState = animatedSimulationEnvironment.finalState;

    if (animatedSimulationEnvironment.finalState.timestamp > newEndTimestamp) {
      // We need to rebuild the final state
      finalState = this.simulationService.buildEnvironment(
        structuredClone(lastContinuousState),
        newEndTimestamp,
      );
    }

    const startTimestamp = Math.max(
      animatedSimulationEnvironment.animationData.startTimestamp,
      newStartTimestamp,
    );
    const startOrder = Math.max(
      animatedSimulationEnvironment.animationData.startOrder,
      newStartOrder,
    );

    const endTimestamp = Math.min(
      animatedSimulationEnvironment.animationData.endTimestamp,
      newEndTimestamp,
    );
    const endOrder = Math.min(
      animatedSimulationEnvironment.animationData.endOrder,
      newEndOrder,
    );

    // No need to crop
    if (
      newStartOrder === startOrder &&
      newStartTimestamp === startTimestamp &&
      newEndOrder === endOrder &&
      newEndTimestamp === endTimestamp
    ) {
      return {
        ...animatedSimulationEnvironment,
        finalState,
        animationData: {
          ...animatedSimulationEnvironment.animationData,
          startTimestamp,
          startOrder,
          endTimestamp,
          endOrder,
        },
      };
    }

    // Copy and crop animation data
    const passengerAnimationData = structuredClone(
      animatedSimulationEnvironment.animationData.passengers,
    );
    Object.entries(passengerAnimationData).forEach(
      ([passengerId, allAnimationData]) => {
        allAnimationData = allAnimationData
          .filter(
            (animationData) =>
              animationData.startOrder < newEndOrder &&
              animationData.startTimestamp < newEndOrder &&
              animationData.endOrder !== null &&
              animationData.endTimestamp !== null &&
              animationData.endOrder > newStartOrder &&
              animationData.endTimestamp > newStartTimestamp,
          )
          .map((animationData) => {
            if (animationData.startOrder < newStartOrder) {
              animationData.startOrder = newStartOrder;
            }

            if (animationData.startTimestamp < newStartTimestamp) {
              animationData.startTimestamp = newStartTimestamp;
            }

            if (animationData.endOrder! > newEndOrder) {
              animationData.endOrder = newEndOrder;
            }

            if (animationData.endTimestamp! > newEndTimestamp) {
              animationData.endTimestamp = newEndTimestamp;
            }

            return animationData;
          });

        if (allAnimationData.length === 0) {
          delete animatedSimulationEnvironment.animationData.passengers[
            passengerId
          ];
        }
      },
    );

    const vehicleAnimationData = structuredClone(
      animatedSimulationEnvironment.animationData.vehicles,
    );
    Object.entries(vehicleAnimationData).forEach(
      ([vehicleId, allAnimationData]) => {
        allAnimationData = allAnimationData
          .filter(
            (animationData) =>
              animationData.startOrder < newEndOrder &&
              animationData.startTimestamp < newEndOrder &&
              animationData.endOrder !== null &&
              animationData.endTimestamp !== null &&
              animationData.endOrder > newStartOrder &&
              animationData.endTimestamp > newStartTimestamp,
          )
          .map((animationData) => {
            if (animationData.startOrder < newStartOrder) {
              animationData.startOrder = newStartOrder;
            }

            if (animationData.startTimestamp < newStartTimestamp) {
              animationData.startTimestamp = newStartTimestamp;
            }

            if (animationData.endOrder! > newEndOrder) {
              animationData.endOrder = newEndOrder;
            }

            if (animationData.endTimestamp! > newEndTimestamp) {
              animationData.endTimestamp = newEndTimestamp;
            }

            return animationData;
          });

        if (allAnimationData.length === 0) {
          delete animatedSimulationEnvironment.animationData.vehicles[
            vehicleId
          ];
        }
      },
    );

    return {
      ...animatedSimulationEnvironment,
      finalState,
      animationData: {
        ...animatedSimulationEnvironment.animationData,
        passengers: passengerAnimationData,
        vehicles: vehicleAnimationData,
        startTimestamp,
        startOrder,
        endTimestamp,
        endOrder,
      },
    };
  }

  private updateEndTimestamps(
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
  ): void {
    for (const passengerAnimationData of Object.values(
      animatedSimulationEnvironment.animationData.passengers,
    )) {
      if (passengerAnimationData.length === 0) {
        continue;
      }

      passengerAnimationData.slice(-1)[0].endTimestamp =
        animatedSimulationEnvironment.animationData.endTimestamp;
    }

    for (const vehicleAnimationData of Object.values(
      animatedSimulationEnvironment.animationData.vehicles,
    )) {
      if (vehicleAnimationData.length === 0) {
        continue;
      }

      vehicleAnimationData.slice(-1)[0].endTimestamp =
        animatedSimulationEnvironment.animationData.endTimestamp;
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
      ? vehicle.previousStops.slice(-1)[0].departureTime
      : null;
    const currentPolylineEndTime = isVehicleTravelling
      ? vehicle.nextStops[0].arrivalTime
      : null;
    const currentPolylineIndex = vehicle.previousStops.length;

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

      displayedPolylines.polylines.push({ ...polyline });
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

    const polylineId = `${stop.position.latitude},${stop.position.longitude},${nextStop.position.latitude},${nextStop.position.longitude}`;
    return polylines[polylineId] ?? null;
  }
}

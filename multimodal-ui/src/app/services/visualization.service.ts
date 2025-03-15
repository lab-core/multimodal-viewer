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
  RUNNING_SIMULATION_STATUSES,
  Simulation,
  SimulationEnvironment,
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
        state,
        polylines?.polylinesByVehicleId ?? {},
        wantedVisualizationTime,
      );

      environment.timestamp = wantedVisualizationTime;

      this.visualizationEnvironment = environment;

      return environment;
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
}

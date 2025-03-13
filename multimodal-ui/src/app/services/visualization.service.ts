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

  private readonly MIN_DEBOUNCE_TIME = 800;
  private fetchTimeout: number | null = null;
  private lastFetchTime = 0;

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

      const firstUpdateTime = simulationStates.states[0].timestamp;
      const lastUpdateTime = simulationStates.states
        .slice(-1)[0]
        .updates.slice(-1)[0].timestamp;

      if (
        wantedVisualizationTime < firstUpdateTime ||
        wantedVisualizationTime > lastUpdateTime
      ) {
        return this.visualizationEnvironment;
      }

      // The wanted state should always be the first
      const state = simulationStates.states[0];

      const polylines = this.simulationService.simulationPolylinesSignal();

      const environment = this.simulationService.buildEnvironment(
        state,
        polylines,
        wantedVisualizationTime,
      );

      environment.timestamp = wantedVisualizationTime;

      this.visualizationEnvironment = environment;

      return environment;
    });

  private readonly _isLoadingSignal: WritableSignal<boolean> = signal(false);

  readonly firstLoadedTimeSignal: Signal<number | null> = computed(() => {
    const simulationStates = this.simulationService.simulationStatesSignal();

    if (simulationStates.states.length === 0) {
      return null;
    }

    return simulationStates.states[0].timestamp;
  });

  readonly lastLoadedTimeSignal: Signal<number | null> = computed(() => {
    const simulationStates = this.simulationService.simulationStatesSignal();

    if (simulationStates.states.length === 0) {
      return null;
    }

    const lastState = simulationStates.states.slice(-1)[0];

    if (lastState.updates.length === 0) {
      return null;
    }

    return lastState.updates.slice(-1)[0].timestamp;
  });

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
      const isFetching = this.simulationService.isFetchingSignal();

      // Find first and last update time
      let firstUpdateTime = -1;
      let lastUpdateTime = -1;

      if (simulationStates.states.length > 0) {
        firstUpdateTime = simulationStates.states[0].timestamp;

        if (
          simulationStates.states[simulationStates.states.length - 1].updates
            .length > 0
        ) {
          lastUpdateTime = simulationStates.states
            .slice(-1)[0]
            .updates.slice(-1)[0].timestamp;
        } else if (
          simulationStates.states.length > 1 &&
          simulationStates.states[simulationStates.states.length - 2].updates
            .length > 0
        ) {
          lastUpdateTime = simulationStates.states
            .slice(-2)[0]
            .updates.slice(-1)[0].timestamp;
        }
      }

      const isFirstStateUseless =
        simulationStates.states.length > 1 &&
        simulationStates.states[1].updates.length > 0 &&
        simulationStates.states[1].updates[0].timestamp <=
          wantedVisualizationTime;

      if (
        firstUpdateTime !== -1 &&
        lastUpdateTime !== -1 &&
        wantedVisualizationTime >= firstUpdateTime &&
        wantedVisualizationTime <= lastUpdateTime &&
        !simulationStates.hasFollowingStates &&
        !isFirstStateUseless
      ) {
        this._isLoadingSignal.set(false);
        return;
      }

      if (!isFetching) {
        this.getMissingSimulationStates(
          simulation.id,
          wantedVisualizationTime,
          firstUpdateTime,
          lastUpdateTime,
          5, // TODO
        );
      }

      this._isLoadingSignal.set(
        wantedVisualizationTime < firstUpdateTime ||
          wantedVisualizationTime > lastUpdateTime,
      );
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
    firstUpdateTime: number,
    lastUpdateTime: number,
    polylinesVersion: number,
  ) {
    if (this.fetchTimeout !== null) {
      clearTimeout(this.fetchTimeout);
      this.fetchTimeout = null;
    }

    const currentTime = Date.now();
    const timeSinceLastDebounce = currentTime - this.lastFetchTime;

    if (timeSinceLastDebounce < this.MIN_DEBOUNCE_TIME) {
      this.fetchTimeout = setTimeout(() => {
        this.fetchTimeout = null;
        this.lastFetchTime = currentTime;
        this.simulationService.getMissingSimulationStates(
          simulationId,
          wantedVisualizationTime,
          firstUpdateTime,
          lastUpdateTime,
          polylinesVersion,
        );
      }, this.MIN_DEBOUNCE_TIME - timeSinceLastDebounce) as unknown as number;
      return;
    }

    this.lastFetchTime = currentTime;
    this.simulationService.getMissingSimulationStates(
      simulationId,
      wantedVisualizationTime,
      firstUpdateTime,
      lastUpdateTime,
      polylinesVersion,
    );
  }
}

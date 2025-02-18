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
  Simulation,
  SimulationEnvironment,
} from '../interfaces/simulation.model';
import { CommunicationService } from './communication.service';
import { SimulationService } from './simulation.service';

@Injectable()
export class VisualizationService {
  // MARK: Properties
  private timeout: number | null = null;

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

  private visualizationTime: number | null = null;
  private readonly _visualizationTimeSignal: Signal<number | null> = computed(
    () => {
      const visualizationMaxTime = this._visualizationMaxTimeSignal();

      if (!this.isInitializedSignal() || visualizationMaxTime === null) {
        return this.visualizationTime;
      }

      const tick = this.tickSignal();
      const visualizationTimeOverride = this.visualizationTimeOverrideSignal();
      const isVisualizationPaused = this.isVisualizationPausedSignal();

      if (this.visualizationTime === null) {
        return this.simulationStartTimeSignal();
      }

      if (
        visualizationTimeOverride !== this.visualizationTimeOverride &&
        visualizationTimeOverride !== null
      ) {
        this.visualizationTimeOverride = visualizationTimeOverride;
        return Math.min(visualizationMaxTime, visualizationTimeOverride);
      }

      if (tick === this.tick) {
        return this.visualizationTime;
      }
      this.tick = tick;

      if (isVisualizationPaused) {
        return this.visualizationTime;
      }

      return Math.min(visualizationMaxTime, this.visualizationTime + 1);
    },
  );

  private visualizationTimeOverride: number | null = null;
  private readonly visualizationTimeOverrideSignal: WritableSignal<
    number | null
  > = signal<number | null>(null);

  private lastRequestFirstOrder: number | null = null;
  private lastRequestLastOrder: number | null = null;
  private lastRequestVisualizationTime: number | null = null;

  // We could slightly improve performances by applying the update on this object directly
  private visualizationEnvironment: SimulationEnvironment | null = null;
  private readonly _visualizationEnvironmentSignal: Signal<SimulationEnvironment | null> =
    computed(() => {
      const visualizationTime = this.visualizationTimeSignal();
      const simulationStates = this.simulationService.simulationStatesSignal();

      if (simulationStates.length === 0 || visualizationTime === null) {
        console.error(
          'No simulation states found for visualization time:',
          visualizationTime,
        );
        return this.visualizationEnvironment;
      }

      const sortedStates = simulationStates
        .sort((a, b) => a.environment.order - b.environment.order)
        .map((state) => ({
          ...state,
          updates: state.updates.sort((a, b) => a.order - b.order),
        }));

      const startState = sortedStates.find(
        (state, index) =>
          state.environment.timestamp <= visualizationTime &&
          state.updates.length > 0 &&
          (state.updates[state.updates.length - 1].timestamp >
            visualizationTime ||
            index === sortedStates.length - 1),
      );

      if (!startState) {
        console.error(
          'No start state found for visualization time:',
          visualizationTime,
          sortedStates,
        );
        return this.visualizationEnvironment;
      }

      const simulationEnvironment = structuredClone(startState.environment);
      const sortedUpdates = startState.updates.sort(
        (a, b) => a.order - b.order,
      );

      for (const update of sortedUpdates) {
        if (update.timestamp > visualizationTime) {
          break;
        }

        this.simulationService.applyUpdate(update, simulationEnvironment);
      }

      this.visualizationEnvironment = structuredClone(simulationEnvironment);

      return simulationEnvironment;
    });

  // MARK: Constructor
  constructor(
    private readonly injector: Injector,
    private readonly communicationService: CommunicationService,
    private readonly simulationService: SimulationService,
  ) {
    effect(() => {
      if (!this.isInitializedSignal()) {
        return;
      }

      const currentVisualizationTime = this._visualizationTimeSignal();

      this.visualizationTime = currentVisualizationTime;
    });

    effect(() => {
      const visualizationTime = this.visualizationTimeSignal();

      const simulationStates = this.simulationService.simulationStatesSignal();

      const simulation = this.simulationService.activeSimulationSignal();

      if (simulation === null || visualizationTime === null) {
        return;
      }

      const firstStateOrder =
        simulationStates.sort(
          (a, b) => a.environment.order - b.environment.order,
        )[0]?.environment.order ?? -1;

      const lastUpdateOrder =
        simulationStates
          .sort((a, b) => b.environment.order - a.environment.order)[0]
          ?.updates.sort((a, b) => b.order - a.order)[0]?.order ?? -1;

      if (
        this.lastRequestFirstOrder === firstStateOrder &&
        this.lastRequestLastOrder === lastUpdateOrder &&
        this.lastRequestVisualizationTime === visualizationTime
      ) {
        return;
      }

      this.lastRequestFirstOrder = firstStateOrder;
      this.lastRequestLastOrder = lastUpdateOrder;
      this.lastRequestVisualizationTime = visualizationTime;

      this.communicationService.emit(
        'get-missing-simulation-states',
        simulation.id,
        firstStateOrder,
        lastUpdateOrder,
        visualizationTime,
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
      simulation.simulationTime ??
        simulation.simulationEndTime ??
        simulation.simulationEstimatedEndTime ??
        null,
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

  get visualizationTimeSignal(): Signal<number | null> {
    return this._visualizationTimeSignal;
  }

  get visualizationEnvironmentSignal(): Signal<SimulationEnvironment | null> {
    return this._visualizationEnvironmentSignal;
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
}

import {
  computed,
  effect,
  inject,
  Injectable,
  Injector,
  runInInjectionContext,
  Signal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import {
  ContinuousEnvironment,
  EnvironmentSlice,
  findClosestContinuousEnvironment,
  sliceEnvironment,
} from '../interfaces/continuous.model';
import {
  RUNNING_SIMULATION_STATUSES,
  Simulation,
} from '../interfaces/simulation.model';
import { AnimationService } from './animation.service';
import { SimulationService } from './simulation.service';
import { TimerService } from './timer.service';

@Injectable()
export class VisualizationService {
  private readonly injector = inject(Injector);
  private readonly simulationService = inject(SimulationService);
  private readonly animationService = inject(AnimationService);
  private readonly timerService = inject(TimerService);

  // MARK: Properties
  private readonly tickSignal: WritableSignal<number> = signal<number>(0);
  private updateTickTimeout: number | null = null;

  private readonly ENVIRONMENT_TICK_INTERVAL = 1000;
  private readonly environmentTickSignal: WritableSignal<number> =
    signal<number>(0);
  private updateEnvironmentTickTimeout: number | null = null;

  private readonly _simulationStartTimeSignal: WritableSignal<number | null> =
    signal<number | null>(null);
  private readonly _simulationEndTimeSignal: WritableSignal<number | null> =
    signal<number | null>(null);
  private readonly _visualizationMaxTimeSignal: WritableSignal<number | null> =
    signal<number | null>(null);

  private readonly _wantedVisualizationTimeSignal: Signal<number | null> =
    computed(() => {
      this.tickSignal();

      return this.timerService.visualizationTime;
    });

  private environmentSlice: EnvironmentSlice | null = null;
  readonly environmentSignal: Signal<EnvironmentSlice | null> = computed(() =>
    this.sliceEnvironment(),
  );

  private hasEnvironmentChanged = false;
  private controlledWantedVisualizationTimeSignal: Signal<number | null> =
    computed(() => {
      this.hasEnvironmentChanged = true;

      return this._wantedVisualizationTimeSignal();
    });

  private controlledContinuousEnvironmentsSignal: Signal<
    ContinuousEnvironment[]
  > = computed(() => {
    this.hasEnvironmentChanged = true;

    return this.simulationService.continuousEnvironmentsSignal();
  });

  // MARK: Constructor
  constructor() {
    effect(
      () =>
        (this.simulationService.wantedVisualizationTime =
          this.wantedVisualizationTimeSignal()),
    );

    effect(
      () => (this.timerService.isLoading = this.sliceEnvironment() === null),
    );

    // MARK: Animation
    effect(() => {
      const polylines = this.simulationService.simulationPolylinesSignal();
      const simulation = this.simulationService.activeSimulationSignal();

      if (
        polylines === null ||
        simulation === null ||
        polylines.version !== simulation.polylinesVersion
      ) {
        this.animationService.updatePolylines(null);
      }

      this.animationService.updatePolylines(polylines);
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

    if (this.updateTickTimeout === null) {
      this.updateTick();
    }

    if (this.updateEnvironmentTickTimeout === null) {
      this.updateEnvironmentTick();
    }
  }

  destroy() {
    if (!this.isInitializedSignal()) {
      return;
    }

    this._simulationStartTimeSignal.set(null);
    this._simulationEndTimeSignal.set(null);
    this._visualizationMaxTimeSignal.set(null);

    if (this.updateTickTimeout !== null) {
      clearTimeout(this.updateTickTimeout);
      this.updateTickTimeout = null;
    }

    if (this.updateEnvironmentTickTimeout !== null) {
      clearTimeout(this.updateEnvironmentTickTimeout);
      this.updateEnvironmentTickTimeout = null;
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

  get wantedVisualizationTimeSignal(): Signal<number | null> {
    return this._wantedVisualizationTimeSignal;
  }

  // MARK: Handlers
  setVisualizationTime(time: number) {
    this.timerService.updateTime(time);
    this.tickSignal.update((tick) => tick + 1);
  }

  // MARK: Private Methods
  private updateTick() {
    runInInjectionContext(this.injector, () => {
      this.tickSignal.update((tick) => tick + 1);
    });

    this.updateTickTimeout = setTimeout(() => {
      this.updateTick();
    }, 250) as unknown as number;
  }

  private updateEnvironmentTick() {
    runInInjectionContext(this.injector, () => {
      this.environmentTickSignal.update((tick) => tick + 1);
    });

    this.updateEnvironmentTickTimeout = setTimeout(() => {
      this.updateEnvironmentTick();
    }, this.ENVIRONMENT_TICK_INTERVAL) as unknown as number;
  }

  // MARK: Computed signals
  private sliceEnvironment(): EnvironmentSlice | null {
    this.environmentTickSignal();

    const wantedVisualizationTime = untracked(
      this.controlledWantedVisualizationTimeSignal,
    );
    if (wantedVisualizationTime === null) {
      return null;
    }

    const continuousEnvironments = untracked(
      this.controlledContinuousEnvironmentsSignal,
    );

    const closestContinuousEnvironment = findClosestContinuousEnvironment(
      continuousEnvironments,
      wantedVisualizationTime,
    );

    if (closestContinuousEnvironment === null) {
      return null;
    }

    if (!this.hasEnvironmentChanged) {
      return this.environmentSlice;
    }

    const environment = sliceEnvironment(
      closestContinuousEnvironment,
      wantedVisualizationTime,
    );

    this.hasEnvironmentChanged = false;

    this.environmentSlice = environment;

    return environment;
  }
}

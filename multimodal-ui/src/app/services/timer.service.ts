import {
  computed,
  effect,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  ContinuousEnvironment,
  findClosestContinuousEnvironment,
} from '../interfaces/continuous.model';
import {
  getVisualizationDirectionLocalStorage,
  getVisualizationIsPausedLocalStorage,
  getVisualizationSpeedPowerLocalStorage,
  getVisualizationTimeLocalStorage,
  setVisualizationDirectionLocalStorage,
  setVisualizationIsPausedLocalStorage,
  setVisualizationSpeedPowerLocalStorage,
  setVisualizationTimeLocalStorage,
} from '../interfaces/local-storage';
import {
  RUNNING_SIMULATION_STATUSES,
  Simulation,
} from '../interfaces/simulation.model';

@Injectable({
  providedIn: 'root',
})
export class TimerService {
  // MARK: Properties
  private readonly MIN_FRAME_RATE = 10; // Hz
  private readonly MAX_TIME_STEP = 1 / this.MIN_FRAME_RATE; // seconds
  private _visualizationTime: number | null = null;
  private isEnvironmentLoaded = false;

  continuousEnvironments: ContinuousEnvironment[] = [];

  private lastUpdateTime: number | null = null;

  private nextIsPaused: boolean | null = null;
  private nextIsLoading: boolean | null = null;
  private nextSpeedPower: number | null = null;
  private nextDirection: number | null = null;

  private readonly _isPausedSignal: WritableSignal<boolean | null> =
    signal(null);
  private readonly _isLoadingSignal: WritableSignal<boolean | null> =
    signal(null);
  private readonly _speedPowerSignal: WritableSignal<number | null> =
    signal(null);
  private readonly _directionSignal: WritableSignal<number | null> =
    signal(null);

  private readonly simulationSignal: WritableSignal<Simulation | null> =
    signal(null);

  readonly isPausedSignal: Signal<boolean> = computed(
    () => this._isPausedSignal() === true,
  );
  readonly isLoadingSignal: Signal<boolean> = computed(
    () => this._isLoadingSignal() === true,
  );
  readonly speedPowerSignal: Signal<number> = computed(
    () => this._speedPowerSignal() ?? 0,
  );
  readonly directionSignal: Signal<number> = computed(
    () => this._directionSignal() ?? 1,
  );

  readonly speedSignal = computed(() => {
    const speedPower = this._speedPowerSignal();
    const direction = this._directionSignal();

    if (speedPower === null || direction === null) {
      return 0;
    }

    return Math.pow(2, speedPower) * direction;
  });

  // MARK: Constructor
  constructor() {
    effect(() => {
      const simulation = this.simulationSignal();

      if (simulation !== null) {
        this.load(simulation.id);
      } else {
        this.reset();
      }
    });

    effect(() => {
      const simulation = this.simulationSignal();

      if (simulation !== null) {
        this.saveIsPaused(simulation.id);
      }
    });

    effect(() => {
      const simulation = this.simulationSignal();

      if (simulation !== null) {
        this.saveSpeedPower(simulation.id);
      }
    });

    effect(() => {
      const simulation = this.simulationSignal();

      if (simulation !== null) {
        this.saveDirection(simulation.id);
      }
    });
  }

  // MARK: Setters
  set isPaused(value: boolean) {
    this.nextIsPaused = value;
  }

  set isLoading(value: boolean) {
    this.nextIsLoading = value;
  }

  set speedPower(value: number) {
    this.nextSpeedPower = value;
  }

  set direction(value: number) {
    this.nextDirection = value;
  }

  set simulation(value: Simulation | null) {
    this.simulationSignal.set(value);
  }

  // MARK: Getters
  get visualizationTime(): number | null {
    return this._visualizationTime;
  }

  // MARK: Time Update
  /**
   *
   * @returns The elapsed time in seconds since the last update, or null if the visualization time could not be updated.
   */
  updateTime(visualizationTimeOverride?: number): number | null {
    if (this.nextIsPaused !== null) {
      this._isPausedSignal.set(this.nextIsPaused);
      this.nextIsPaused = null;
    }

    if (this.nextIsLoading !== null) {
      this._isLoadingSignal.set(this.nextIsLoading);
      this.nextIsLoading = null;
    }

    if (this.nextSpeedPower !== null) {
      this._speedPowerSignal.set(this.nextSpeedPower);
      this.nextSpeedPower = null;
    }

    if (this.nextDirection !== null) {
      this._directionSignal.set(this.nextDirection);
      this.nextDirection = null;
    }

    const { visualizationTime, elapsedTime } = this.updateTimeAtomic(
      visualizationTimeOverride,
    );

    const simulation = this.simulationSignal();

    if (
      visualizationTime === null ||
      elapsedTime === null ||
      simulation === null
    ) {
      this.isEnvironmentLoaded = false;
      this._visualizationTime = null;

      if (simulation !== null) {
        this.saveTime(simulation.id);
      }

      return null;
    }

    const closestContinuousEnvironment = findClosestContinuousEnvironment(
      this.continuousEnvironments,
      visualizationTime,
    );

    this.isEnvironmentLoaded = !!closestContinuousEnvironment;

    this._visualizationTime = visualizationTime;

    this.saveTime(simulation.id);

    return elapsedTime;
  }

  private updateTimeAtomic(visualizationTimeOverride?: number): {
    visualizationTime: number | null;
    elapsedTime: number | null;
  } {
    const simulation = this.simulationSignal();

    if (simulation === null) {
      this.lastUpdateTime = null;
      return { visualizationTime: null, elapsedTime: null };
    }

    const simulationStartTime = simulation.simulationStartTime;
    const visualizationMaxTime = RUNNING_SIMULATION_STATUSES.includes(
      simulation.status,
    )
      ? (simulation.simulationTime ?? simulation.simulationStartTime)
      : simulation.simulationEndTime;

    if (simulationStartTime === null || visualizationMaxTime === null) {
      return { visualizationTime: null, elapsedTime: null };
    }

    const now = performance.now();
    const lastUpdateTime = this.lastUpdateTime ?? now;
    this.lastUpdateTime = now;
    const elapsedTime = Math.min(
      (now - lastUpdateTime) / 1000,
      this.MAX_TIME_STEP,
    );

    if (visualizationTimeOverride !== undefined) {
      const visualizationTime = Math.max(
        Math.min(visualizationMaxTime, visualizationTimeOverride),
        simulationStartTime,
      );
      return { visualizationTime, elapsedTime };
    }

    if (this._visualizationTime === null) {
      return { visualizationTime: simulationStartTime, elapsedTime };
    }

    if (
      this.isLoadingSignal() ||
      this.isPausedSignal() ||
      !this.isEnvironmentLoaded
    ) {
      return { visualizationTime: this._visualizationTime, elapsedTime };
    }

    const visualizationTime = Math.min(
      visualizationMaxTime,
      Math.max(
        this._visualizationTime + elapsedTime * this.speedSignal(),
        simulationStartTime,
      ),
    );

    return { visualizationTime, elapsedTime };
  }

  // MARK: Local Storage
  private reset(): void {
    this.nextIsPaused = null;
    this.nextIsLoading = null;
    this.nextSpeedPower = null;
    this.nextDirection = null;
    this._isPausedSignal.set(null);
    this._isLoadingSignal.set(null);
    this._speedPowerSignal.set(null);
    this._directionSignal.set(null);
    this._visualizationTime = null;
    this.isEnvironmentLoaded = false;
    this.continuousEnvironments = [];
    this.lastUpdateTime = null;
  }

  private load(simulationId: string): void {
    const isPaused = getVisualizationIsPausedLocalStorage(simulationId);

    if (isPaused !== null) {
      this.isPaused = isPaused;
    } else {
      this.isPaused = false;
    }

    const speedPower = getVisualizationSpeedPowerLocalStorage(simulationId);

    if (speedPower !== null) {
      this.speedPower = speedPower;
    } else {
      this.speedPower = 0;
    }

    const direction = getVisualizationDirectionLocalStorage(simulationId);

    if (direction !== null) {
      this.direction = direction;
    } else {
      this.direction = 1;
    }

    const time = getVisualizationTimeLocalStorage(simulationId);

    if (time !== null) {
      this._visualizationTime = time;
    } else {
      this._visualizationTime = null;
    }
  }

  private saveIsPaused(simulationId: string): void {
    const isPaused = this._isPausedSignal();
    if (isPaused !== null) {
      setVisualizationIsPausedLocalStorage(simulationId, isPaused);
    }
  }

  private saveSpeedPower(simulationId: string): void {
    const speedPower = this._speedPowerSignal();
    if (speedPower !== null) {
      setVisualizationSpeedPowerLocalStorage(simulationId, speedPower);
    }
  }

  private saveDirection(simulationId: string): void {
    const direction = this._directionSignal();
    if (direction !== null) {
      setVisualizationDirectionLocalStorage(simulationId, direction);
    }
  }

  private saveTime(simulationId: string): void {
    if (this._visualizationTime !== null) {
      setVisualizationTimeLocalStorage(simulationId, this._visualizationTime);
    }
  }
}

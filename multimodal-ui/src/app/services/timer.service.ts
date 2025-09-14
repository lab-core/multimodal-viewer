import { Injectable } from '@angular/core';
import {
  ContinuousEnvironment,
  findClosestContinuousEnvironment,
} from '../interfaces/continuous.model';
import { RUNNING_SIMULATION_STATUSES } from '../interfaces/simulation.model';
import { SimulationService } from './simulation.service';

@Injectable({
  providedIn: 'root',
})
export class TimerService {
  private readonly MIN_FRAME_RATE = 10; // Hz
  private readonly MAX_TIME_STEP = 1 / this.MIN_FRAME_RATE; // seconds
  private _visualizationTime: number | null = null;
  private isEnvironmentLoaded = false;
  private _continuousEnvironments: ContinuousEnvironment[] = [];

  private lastUpdateTime: number | null = null;

  isPaused = false;
  isLoading = false;
  speed = 1;

  constructor(private readonly simulationService: SimulationService) {}

  get visualizationTime(): number | null {
    return this._visualizationTime;
  }

  get continuousEnvironments(): ContinuousEnvironment[] {
    return this._continuousEnvironments;
  }

  /**
   *
   * @returns The elapsed time in seconds since the last update, or null if there is no active simulation.
   */
  updateTime(visualizationTimeOverride?: number): number | null {
    const { visualizationTime, elapsedTime } = this.updateTimeAtomic(
      visualizationTimeOverride,
    );

    if (visualizationTime === null || elapsedTime === null) {
      this.isEnvironmentLoaded = false;
      this._visualizationTime = null;
      return null;
    }

    const continuousEnvironments =
      this.simulationService.continuousEnvironmentsSignal();

    this._continuousEnvironments = continuousEnvironments;

    const closestContinuousEnvironment = findClosestContinuousEnvironment(
      continuousEnvironments,
      visualizationTime,
    );

    this.isEnvironmentLoaded = !!closestContinuousEnvironment;

    this._visualizationTime = visualizationTime;

    return elapsedTime;
  }

  private updateTimeAtomic(visualizationTimeOverride?: number): {
    visualizationTime: number | null;
    elapsedTime: number | null;
  } {
    const simulation = this.simulationService.activeSimulationSignal();

    if (simulation === null) {
      this.lastUpdateTime = null;
      this.isPaused = false;
      this.isLoading = false;
      this.speed = 1;
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

    if (this.isLoading || this.isPaused || !this.isEnvironmentLoaded) {
      return { visualizationTime: this._visualizationTime, elapsedTime };
    }

    const visualizationTime = Math.min(
      visualizationMaxTime,
      Math.max(
        this._visualizationTime + elapsedTime * this.speed,
        simulationStartTime,
      ),
    );

    return { visualizationTime, elapsedTime };
  }
}

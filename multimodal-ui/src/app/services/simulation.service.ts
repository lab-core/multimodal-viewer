import {
  computed,
  effect,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import {
  DEBUG_TASKS,
  MAX_STATES_EXTRACTION_CONCURRENT_TASKS,
} from '../../environments/environment';
import {
  ContinuousEnvironment,
  ContinuousEnvironmentReferences,
  createContinuousEnvironmentReferences,
  updateContinuousEnvironmentsEndTimestamps,
} from '../interfaces/continuous.model';
import {
  AllPolylines,
  extractAllPolylines,
} from '../interfaces/polylines.model';
import { Simulation } from '../interfaces/simulation.model';
import { SimulationState } from '../interfaces/state.model';
import { EXTRACT_STATE_TASK_PRIORITY, Task } from '../interfaces/task.model';
import { CommunicationService } from './communication.service';
import { DataService } from './data.service';
import { TaskService } from './task.service';
import { TimerService } from './timer.service';

interface DebounceSettings {
  readonly debounceTime: number;
  lastExecutionTime: number | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

@Injectable({
  providedIn: 'root',
})
export class SimulationService {
  // MARK: Properties
  private readonly stateExtractionTasks = new Map<
    number,
    { task: Task; startTimestamp: number }
  >();

  private readonly _activeSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _simulationPolylinesSignal: WritableSignal<AllPolylines | null> =
    signal(null);

  private readonly isFetchingStatesSignal: WritableSignal<boolean> =
    signal(false);

  private readonly isFetchingPolylinesSignal: WritableSignal<boolean> =
    signal(false);

  private readonly _continuousEnvironmentsSignal: WritableSignal<
    ContinuousEnvironment[]
  > = signal([]);

  private alreadyUpdatedEnvironmentUpdateIndexes: number[] = [];

  private references: ContinuousEnvironmentReferences =
    createContinuousEnvironmentReferences();

  private readonly hasAllStatesSignal: WritableSignal<boolean> = signal(false);

  private readonly getPolylinesDebounceSettings: DebounceSettings = {
    debounceTime: 500,
    lastExecutionTime: null,
    timeoutId: null,
  };

  private readonly getMissingSimulationStatesDebounceSettings: DebounceSettings =
    {
      debounceTime: 100,
      lastExecutionTime: null,
      timeoutId: null,
    };

  private wantedVisualizationTimeSignal: WritableSignal<number | null> =
    signal(null);

  // MARK: Constructor
  constructor(
    private readonly dataService: DataService,
    private readonly communicationService: CommunicationService,
    private readonly taskService: TaskService,
    private readonly timerService: TimerService,
  ) {
    effect(() => this.getPolylinesIfNeeded());

    effect(() => this.getMissingSimulationStatesIfNeeded());

    effect(
      () => (this.timerService.simulation = this.activeSimulationSignal()),
    );

    effect(
      () =>
        (this.timerService.continuousEnvironments =
          this.continuousEnvironmentsSignal()),
    );
  }

  // MARK: Active simulation
  setActiveSimulationId(simulationId: string) {
    this.unsetActiveSimulationId();

    this._activeSimulationIdSignal.set(simulationId);

    this.communicationService.on(
      'missing-simulation-states',
      (serializedMissingStatesEnvironments, hasAllStates) => {
        this.onMissingSimulationStates(
          serializedMissingStatesEnvironments,
          hasAllStates,
        );
      },
    );

    this.communicationService.on(
      `polylines-${simulationId}`,
      (polylinesByCoordinates, version) => {
        this.isFetchingPolylinesSignal.set(false);

        this._simulationPolylinesSignal.set(
          extractAllPolylines(polylinesByCoordinates, version),
        );
      },
    );
  }

  unsetActiveSimulationId() {
    const activeSimulationId = this._activeSimulationIdSignal();

    this._activeSimulationIdSignal.set(null);

    this._simulationPolylinesSignal.set(null);

    this.isFetchingStatesSignal.set(false);
    this.isFetchingPolylinesSignal.set(false);

    this.communicationService.removeAllListeners('missing-simulation-states');

    if (activeSimulationId) {
      this.communicationService.removeAllListeners(
        `polylines-${activeSimulationId}`,
      );
    }

    this._continuousEnvironmentsSignal.set([]);

    this.alreadyUpdatedEnvironmentUpdateIndexes = [];

    this.references = createContinuousEnvironmentReferences();

    this.hasAllStatesSignal.set(false);
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

  // MARK: States
  private getMissingSimulationStatesIfNeeded() {
    const hasAllStates = this.hasAllStatesSignal();

    if (hasAllStates) {
      return;
    }

    const simulation = this.activeSimulationSignal();

    if (simulation === null) {
      this.timerService.isLoading = true;
      return;
    }

    const wantedVisualizationTime = this.wantedVisualizationTimeSignal();

    if (wantedVisualizationTime === null) {
      this.timerService.isLoading = true;
      return;
    }

    this.updateTasksPriority(wantedVisualizationTime);

    const isFetching = this.isFetchingStatesSignal();

    if (isFetching) {
      return;
    }

    const continuousEnvironments = this.continuousEnvironmentsSignal();

    if (
      this.stateExtractionTasks.size >= MAX_STATES_EXTRACTION_CONCURRENT_TASKS
    ) {
      return;
    }

    const completeStateUpdateIndexes = continuousEnvironments
      .filter((continuousEnvironment) => continuousEnvironment.isComplete)
      .map((continuousEnvironment) => continuousEnvironment.startUpdateIndex);

    const currentlyProcessingStateUpdateIndexes = Array.from(
      this.stateExtractionTasks.keys(),
    );

    this.runWithDebounce(() => {
      this.getMissingSimulationStates(
        simulation.id,
        wantedVisualizationTime,
        Array.from(
          new Set(
            completeStateUpdateIndexes.concat(
              currentlyProcessingStateUpdateIndexes,
            ),
          ),
        ),
      );
    }, this.getMissingSimulationStatesDebounceSettings);
  }

  private updateTasksPriority(wantedVisualizationTime: number) {
    let mostUrgentTask: { task: Task; startTimestamp: number } | null = null;

    let previousProximity = Infinity;

    for (const task of this.stateExtractionTasks.values()) {
      task.task.updatePriority(EXTRACT_STATE_TASK_PRIORITY);

      const proximity = task.startTimestamp - wantedVisualizationTime;

      /**
       * The most urgent task is the one with a start time before the wanted
       * visualization time that is the closest to it.
       *
       * If all tasks are after the wanted visualization time, then the most
       * urgent task is the one with the closest start time.
       **/
      if (
        (proximity < 0 &&
          (previousProximity > 0 || proximity > previousProximity)) ||
        proximity < previousProximity
      ) {
        mostUrgentTask = task;

        previousProximity = proximity;
      }
    }

    if (mostUrgentTask) {
      mostUrgentTask.task.updatePriority(EXTRACT_STATE_TASK_PRIORITY + 1);
    }

    if (DEBUG_TASKS) {
      console.debug('updateTasksPriority', {
        wantedVisualizationTime,
        mostUrgentTask,
        stateExtractionTasks: Array.from(this.stateExtractionTasks.entries()),
      });
    }
  }

  private getMissingSimulationStates(
    simulationId: string,
    visualizationTime: number,
    completeStateUpdateIndexes: number[],
  ) {
    if (DEBUG_TASKS) {
      console.debug('getMissingSimulationStates', {
        simulationId,
        visualizationTime,
        completeStateUpdateIndexes,
      });
    }

    this.isFetchingStatesSignal.set(true);

    this.communicationService.emit(
      'get-missing-simulation-states',
      simulationId,
      visualizationTime,
      completeStateUpdateIndexes,
    );
  }

  set wantedVisualizationTime(visualizationTime: number | null) {
    this.wantedVisualizationTimeSignal.set(visualizationTime);
  }

  get continuousEnvironmentsSignal(): Signal<ContinuousEnvironment[]> {
    return this._continuousEnvironmentsSignal;
  }

  // MARK: Polylines
  private getPolylinesIfNeeded() {
    const simulation = this.activeSimulationSignal();

    if (simulation === null) {
      return;
    }

    const polylines = this.simulationPolylinesSignal();
    const isFetching = this.isFetchingPolylinesSignal();

    const needPolylineUpdate =
      polylines === null || polylines.version !== simulation.polylinesVersion;

    if (needPolylineUpdate && !isFetching) {
      this.runWithDebounce(() => {
        this.getPolylinesWithoutDebounce(simulation.id);
      }, this.getPolylinesDebounceSettings);
    }
  }

  private getPolylinesWithoutDebounce(simulationId: string) {
    this.isFetchingPolylinesSignal.set(true);

    this.communicationService.emit('get-polylines', simulationId);
  }

  get simulationPolylinesSignal(): Signal<AllPolylines | null> {
    return this._simulationPolylinesSignal;
  }

  // MARK: Event handlers
  private onMissingSimulationStates(
    serializedMissingStates: unknown,
    hasAllStates: unknown,
  ): void {
    if (DEBUG_TASKS) {
      console.debug('onMissingSimulationStates', {
        serializedMissingStates,
        hasAllStates,
      });
    }

    this.isFetchingStatesSignal.set(false);

    if (!Array.isArray(serializedMissingStates)) {
      console.error(
        'Received invalid serializedMissingStates value from the server.',
      );
      return;
    }

    for (const serializedMissingState of serializedMissingStates as unknown[]) {
      if (
        typeof serializedMissingState !== 'object' ||
        serializedMissingState === null
      ) {
        console.error(
          'Received invalid serializedMissingState value from the server.',
        );
        return;
      }

      if (!('environment' in serializedMissingState)) {
        console.error(
          'Received invalid serializedMissingState value from the server. Missing environment.',
        );
        return;
      }

      if (!('updates' in serializedMissingState)) {
        console.error(
          'Received invalid serializedMissingState value from the server. Missing updates.',
        );
        return;
      }

      if (!('startTimestamp' in serializedMissingState)) {
        console.error(
          'Received invalid serializedMissingState value from the server. Missing startTimestamp.',
        );
        return;
      }

      if (typeof serializedMissingState.startTimestamp !== 'number') {
        console.error(
          'Received invalid serializedMissingState value from the server. Invalid startTimestamp.',
        );
        return;
      }

      if (!('startUpdateIndex' in serializedMissingState)) {
        console.error(
          'Received invalid serializedMissingState value from the server. Missing startUpdateIndex.',
        );
        return;
      }

      if (typeof serializedMissingState.startUpdateIndex !== 'number') {
        console.error(
          'Received invalid serializedMissingState value from the server. Invalid startUpdateIndex.',
        );
        return;
      }

      const startTimestamp = serializedMissingState.startTimestamp;
      const startUpdateIndex = serializedMissingState.startUpdateIndex;

      const task = this.taskService.extractStateTask(
        serializedMissingState.environment,
        serializedMissingState.updates,
        (extractedState) =>
          this.afterExtractStateTask(
            extractedState,
            startUpdateIndex,
            startTimestamp,
          ),
      );

      this.stateExtractionTasks.set(startUpdateIndex, {
        task,
        startTimestamp,
      });

      if (DEBUG_TASKS) {
        console.debug(
          'stateExtractionTasks',
          Array.from(this.stateExtractionTasks.entries()),
        );
      }
    }

    if (typeof hasAllStates !== 'boolean') {
      console.error('Received invalid hasAllStates value from the server.');
      return;
    }

    this.hasAllStatesSignal.set(hasAllStates);
  }

  private afterExtractStateTask(
    extractedState: SimulationState | null,
    startUpdateIndex: number,
    startTimestamp: number,
  ): void {
    if (DEBUG_TASKS) {
      console.debug('afterExtractStateTask', {
        extractedState,
        startUpdateIndex,
        startTimestamp,
      });
    }

    if (extractedState === null) {
      console.error(
        'Failed to extract missing simulation state from the server response.',
      );

      this.stateExtractionTasks.delete(startUpdateIndex);

      if (DEBUG_TASKS) {
        console.debug(
          'stateExtractionTasks',
          Array.from(this.stateExtractionTasks.entries()),
        );
      }

      return;
    }

    this.stateExtractionTasks.set(startUpdateIndex, {
      task: this.taskService.buildContinuousEnvironmentTask(
        extractedState,
        this.references,
        (continuousEnvironment) =>
          this.afterBuildContinuousEnvironmentTask(
            continuousEnvironment,
            startUpdateIndex,
          ),
      ),
      startTimestamp,
    });

    if (DEBUG_TASKS) {
      console.debug(
        'stateExtractionTasks',
        Array.from(this.stateExtractionTasks.entries()),
      );
    }
  }

  private afterBuildContinuousEnvironmentTask(
    continuousEnvironment: ContinuousEnvironment,
    startUpdateIndex: number,
  ) {
    if (DEBUG_TASKS) {
      console.debug('afterBuildContinuousEnvironmentTask', {
        continuousEnvironment,
        startUpdateIndex,
      });
    }

    this.stateExtractionTasks.delete(startUpdateIndex);

    if (DEBUG_TASKS) {
      console.debug(
        'stateExtractionTasks',
        Array.from(this.stateExtractionTasks.entries()),
      );
    }

    this._continuousEnvironmentsSignal.update((environments) => {
      const newEnvironments = [...environments];

      const existingEnvironmentIndex = newEnvironments.findIndex(
        (existingEnvironment) =>
          existingEnvironment.startUpdateIndex ===
          continuousEnvironment.startUpdateIndex,
      );

      if (existingEnvironmentIndex === -1) {
        newEnvironments.push(continuousEnvironment);
      } else {
        newEnvironments[existingEnvironmentIndex] = continuousEnvironment;
      }

      newEnvironments.sort((a, b) => a.startUpdateIndex - b.startUpdateIndex);

      updateContinuousEnvironmentsEndTimestamps(
        newEnvironments,
        this.alreadyUpdatedEnvironmentUpdateIndexes,
      );

      return newEnvironments;
    });
  }

  private runWithDebounce(
    callback: () => void,
    debounceSettings: DebounceSettings,
  ): void {
    if (debounceSettings.timeoutId !== null) {
      clearTimeout(debounceSettings.timeoutId);
      debounceSettings.timeoutId = null;
    }

    const currentTime = Date.now();
    const timeSinceLastExecution =
      currentTime - (debounceSettings.lastExecutionTime ?? 0);

    if (timeSinceLastExecution < debounceSettings.debounceTime) {
      debounceSettings.timeoutId = setTimeout(() => {
        debounceSettings.timeoutId = null;
        debounceSettings.lastExecutionTime = Date.now();
        callback();
      }, debounceSettings.debounceTime - timeSinceLastExecution);
      return;
    }

    debounceSettings.lastExecutionTime = currentTime;
    callback();
  }
}

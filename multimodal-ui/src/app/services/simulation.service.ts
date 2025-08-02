import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
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
import { CommunicationService } from './communication.service';
import { DataService } from './data.service';
import { TaskService } from './task.service';

@Injectable({
  providedIn: 'root',
})
export class SimulationService {
  // MARK: Properties
  private readonly _activeSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _simulationPolylinesSignal: WritableSignal<AllPolylines | null> =
    signal(null);

  private readonly _isFetchingStatesSignal: WritableSignal<boolean> =
    signal(false);

  private readonly _isFetchingPolylinesSignal: WritableSignal<boolean> =
    signal(false);

  private readonly _continuousEnvironmentsSignal: WritableSignal<
    ContinuousEnvironment[]
  > = signal([]);

  private alreadyUpdatedEnvironmentUpdateIndexes: number[] = [];

  private references: ContinuousEnvironmentReferences =
    createContinuousEnvironmentReferences();

  private readonly _hasAllStatesSignal: WritableSignal<boolean> = signal(false);

  // MARK: Constructor
  constructor(
    private readonly dataService: DataService,
    private readonly communicationService: CommunicationService,
    private readonly taskService: TaskService,
  ) {}

  // MARK: Active simulation
  setActiveSimulationId(simulationId: string) {
    this.unsetActiveSimulationId();

    this._activeSimulationIdSignal.set(simulationId);

    this.communicationService.on(
      'missing-simulation-states',
      (
        serializedMissingStatesEnvironments,
        serializedMissingStatesUpdates,
        hasAllStates,
      ) => {
        this.onMissingSimulationStates(
          serializedMissingStatesEnvironments,
          serializedMissingStatesUpdates,
          hasAllStates,
        );
      },
    );

    this.communicationService.on(
      `polylines-${simulationId}`,
      (polylinesByCoordinates, version) => {
        this._isFetchingPolylinesSignal.set(false);

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

    this._isFetchingStatesSignal.set(false);
    this._isFetchingPolylinesSignal.set(false);

    this.communicationService.removeAllListeners('missing-simulation-states');

    if (activeSimulationId) {
      this.communicationService.removeAllListeners(
        `polylines-${activeSimulationId}`,
      );
    }

    this._continuousEnvironmentsSignal.set([]);

    this.alreadyUpdatedEnvironmentUpdateIndexes = [];

    this.references = createContinuousEnvironmentReferences();

    this._hasAllStatesSignal.set(false);
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

  getMissingSimulationStates(
    simulationId: string,
    visualizationTime: number,
    completeStateUpdateIndexes: number[],
  ) {
    this._isFetchingStatesSignal.set(true);

    this.communicationService.emit(
      'get-missing-simulation-states',
      simulationId,
      visualizationTime,
      completeStateUpdateIndexes,
    );
  }

  getPolylines(simulationId: string) {
    this._isFetchingPolylinesSignal.set(true);

    this.communicationService.emit('get-polylines', simulationId);
  }

  get simulationPolylinesSignal(): Signal<AllPolylines | null> {
    return this._simulationPolylinesSignal;
  }

  get isFetchingStatesSignal(): Signal<boolean> {
    return this._isFetchingStatesSignal;
  }

  get isFetchingPolylinesSignal(): Signal<boolean> {
    return this._isFetchingPolylinesSignal;
  }

  get continuousEnvironmentsSignal(): Signal<ContinuousEnvironment[]> {
    return this._continuousEnvironmentsSignal;
  }

  get hasAllStatesSignal(): Signal<boolean> {
    return this._hasAllStatesSignal;
  }

  // MARK: Event handlers
  private onMissingSimulationStates(
    serializedMissingStatesEnvironments: unknown,
    serializedMissingStatesUpdates: unknown,
    hasAllStates: unknown,
  ): void {
    this.taskService.extractStateTask(
      serializedMissingStatesEnvironments,
      serializedMissingStatesUpdates,
      (extractedStates) =>
        this.afterExtractStateTask(extractedStates, hasAllStates),
    );
  }

  private afterExtractStateTask(
    extractedStates: SimulationState[] | null,
    hasAllStates: unknown,
  ): void {
    if (extractedStates === null) {
      console.error(
        'Failed to extract missing simulation states from the server response.',
      );

      this._isFetchingStatesSignal.set(false);
      return;
    }

    this.taskService.buildContinuousEnvironmentsTask(
      extractedStates,
      this.references,
      (continuousEnvironments) =>
        this.afterBuildContinuousEnvironmentsTask(
          continuousEnvironments,
          hasAllStates,
        ),
    );
  }

  private afterBuildContinuousEnvironmentsTask(
    continuousEnvironments: ContinuousEnvironment[],
    hasAllStates: unknown,
  ) {
    this._continuousEnvironmentsSignal.update((environments) => {
      for (const environment of continuousEnvironments) {
        const existingEnvironmentIndex = environments.findIndex(
          (existingEnvironment) =>
            existingEnvironment.startUpdateIndex ===
            environment.startUpdateIndex,
        );

        if (existingEnvironmentIndex === -1) {
          environments.push(environment);
        } else {
          environments[existingEnvironmentIndex] = environment;
        }
      }

      environments.sort((a, b) => a.startUpdateIndex - b.startUpdateIndex);

      updateContinuousEnvironmentsEndTimestamps(
        environments,
        this.alreadyUpdatedEnvironmentUpdateIndexes,
      );

      return [...environments];
    });

    if (typeof hasAllStates !== 'boolean') {
      console.error('Received invalid hasAllStates value from the server.');

      hasAllStates = false;
    } else {
      this._hasAllStatesSignal.set(hasAllStates);
    }

    this._isFetchingStatesSignal.set(false);
  }
}

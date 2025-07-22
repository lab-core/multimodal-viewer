import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { AnimatedSimulationStates } from '../interfaces/animation.model';
import {
  buildContinuousEnvironment,
  ContinuousEnvironment,
  ContinuousEnvironmentReferences,
  createContinuousEnvironmentReferences,
} from '../interfaces/continuous.model';
import { SimulationEnvironment } from '../interfaces/environment.model';
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

  private readonly _simulationStatesSignal: WritableSignal<AnimatedSimulationStates> =
    signal({
      states: [],
      shouldRequestMoreStates: true,
      firstContinuousState: null,
      lastContinuousState: null,
      currentState: null,
    });

  private readonly _simulationPolylinesSignal: WritableSignal<AllPolylines | null> =
    signal(null);

  private readonly _isFetchingStatesSignal: WritableSignal<boolean> =
    signal(false);

  private readonly _isFetchingPolylinesSignal: WritableSignal<boolean> =
    signal(false);

  private readonly _continuousEnvironmentsSignal: WritableSignal<
    ContinuousEnvironment[]
  > = signal([]);

  private references: ContinuousEnvironmentReferences =
    createContinuousEnvironmentReferences();

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
        stateUpdateIndexesToKeep,
        shouldRequestMoreStates,
        firstContinuousStateUpdateIndex,
        lastContinuousStateUpdateIndex,
        currentStateUpdateIndex,
      ) => {
        this.taskService.extractStateTask(
          serializedMissingStatesEnvironments,
          serializedMissingStatesUpdates,
          (extractedStates) => {
            if (extractedStates === null) {
              console.error(
                'Failed to extract missing simulation states from the server response.',
              );

              this._isFetchingStatesSignal.set(false);
              return;
            }

            this._simulationStatesSignal.update((states) => {
              return this.mergeStates(
                states,
                extractedStates,
                stateUpdateIndexesToKeep as number[],
                !!shouldRequestMoreStates,
                firstContinuousStateUpdateIndex as number,
                lastContinuousStateUpdateIndex as number,
                currentStateUpdateIndex as number,
              );
            });

            this.updateContinuousEnvironments(extractedStates);

            this._isFetchingStatesSignal.set(false);
          },
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

    this._simulationStatesSignal.set({
      states: [],
      shouldRequestMoreStates: true,
      firstContinuousState: null,
      lastContinuousState: null,
      currentState: null,
      // continuousAnimationData: null,
      // continuousEnvironment: null,
    });

    this._simulationPolylinesSignal.set(null);

    this._isFetchingStatesSignal.set(false);
    this._isFetchingPolylinesSignal.set(false);

    this.communicationService.removeAllListeners('missing-simulation-states');

    if (activeSimulationId) {
      this.communicationService.removeAllListeners(
        `polylines-${activeSimulationId}`,
      );
    }

    this.references = createContinuousEnvironmentReferences();
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
    allStateUpdateIndexes: number[],
  ) {
    this._isFetchingStatesSignal.set(true);

    this.communicationService.emit(
      'get-missing-simulation-states',
      simulationId,
      visualizationTime,
      allStateUpdateIndexes,
    );
  }

  getPolylines(simulationId: string) {
    this._isFetchingPolylinesSignal.set(true);

    this.communicationService.emit('get-polylines', simulationId);
  }

  get simulationStatesSignal(): Signal<AnimatedSimulationStates> {
    return this._simulationStatesSignal;
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

  // MARK: Build environment
  /**
   * Apply an update to the simulation environment in place.
   */
  buildEnvironment(
    state: SimulationState,
    visualizationTime: number,
  ): SimulationEnvironment {
    for (const update of state.updates) {
      if (update.timestamp > visualizationTime) {
        break;
      }

      update.apply(state);
    }

    return state;
  }

  private mergeStates(
    states: AnimatedSimulationStates,
    missingStates: SimulationState[],
    stateUpdateIndexesToKeep: number[],
    shouldRequestMoreStates: boolean,
    firstContinuousStateUpdateIndex: number,
    lastContinuousStateUpdateIndex: number,
    currentStateUpdateIndex: number,
  ): AnimatedSimulationStates {
    const animatedMissingStates: SimulationState[] = missingStates.map(
      (state) => {
        return {
          ...state,
        };
      },
    );

    for (const state of states.states) {
      if (stateUpdateIndexesToKeep.includes(state.updateIndex)) {
        animatedMissingStates.push(state);
      }
    }

    const sortedStates = animatedMissingStates.sort(
      (a, b) => a.updateIndex - b.updateIndex,
    );

    const firstStateIndex = sortedStates.findIndex(
      (state) => state.updateIndex === firstContinuousStateUpdateIndex,
    );
    const lastStateIndex = sortedStates.findIndex(
      (state) => state.updateIndex === lastContinuousStateUpdateIndex,
    );

    const currentStateIndex = sortedStates.findIndex(
      (state) => state.updateIndex === currentStateUpdateIndex,
    );

    const defaultReturnValue = {
      states: sortedStates,
      shouldRequestMoreStates,
      firstContinuousState: null,
      lastContinuousState: null,
      currentState: null,
    };

    if (firstStateIndex === -1) {
      console.error(
        'First continuous state not found: ',
        firstContinuousStateUpdateIndex,
      );
      return defaultReturnValue;
    }
    if (lastStateIndex === -1) {
      console.error(
        'Last continuous state not found: ',
        lastContinuousStateUpdateIndex,
      );
      return defaultReturnValue;
    }
    if (currentStateIndex === -1) {
      console.error('Current state not found: ', currentStateUpdateIndex);
      return defaultReturnValue;
    }
    if (
      currentStateIndex > lastStateIndex ||
      currentStateIndex < firstStateIndex
    ) {
      console.error(
        'Current state out of bounds: ',
        currentStateIndex,
        firstStateIndex,
        lastStateIndex,
      );
      return defaultReturnValue;
    }

    const firstState = sortedStates[firstStateIndex];
    const lastState = sortedStates[lastStateIndex];

    const firstContinuousState = {
      timestamp: firstState.timestamp,
      updateIndex: firstState.updateIndex,
      index: firstStateIndex,
    };

    const lastContinuousUpdate =
      lastState.updates[lastState.updates.length - 1];

    const lastContinuousState = {
      timestamp: lastContinuousUpdate?.timestamp ?? lastState.timestamp,
      updateIndex: lastContinuousUpdate?.updateIndex ?? lastState.updateIndex,
      index: lastStateIndex,
    };

    const currentState = sortedStates[currentStateIndex];

    const startTimestamp = currentState.timestamp;

    let endTimestamp: number;
    if (currentStateIndex + 1 <= lastStateIndex) {
      endTimestamp = sortedStates[currentStateIndex + 1].timestamp;
    } else {
      endTimestamp = lastContinuousUpdate?.timestamp ?? currentState.timestamp;
    }

    return {
      states: sortedStates,
      shouldRequestMoreStates,
      firstContinuousState,
      lastContinuousState,
      currentState: {
        startTimestamp,
        endTimestamp,
      },
    };
  }

  private updateContinuousEnvironments(states: SimulationState[]): void {
    const continuousEnvironments: ContinuousEnvironment[] = [];

    for (const state of states) {
      const continuousEnvironment = buildContinuousEnvironment(
        state,
        state.updates,
        this.references,
      );

      continuousEnvironments.push(continuousEnvironment);
    }

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

      return [...environments];
    });
  }
}

import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  extractSimulation,
  Simulation,
  sortSimulations,
} from '../interfaces/simulation.model';
import { CommunicationService } from './communication.service';

@Injectable({
  providedIn: 'root',
})
export class DataService {
  // MARK: Properties
  private readonly _simulationsSignal: WritableSignal<Simulation[]> = signal(
    [],
  );

  private readonly _availableSimulationDataSignal: WritableSignal<string[]> =
    signal([]);

  // MARK: Constructor
  constructor(private readonly communicationService: CommunicationService) {
    this.listen();

    this.query();

    this.communicationService.onConnect(() => {
      this.query();
    });
  }

  // MARK: Getters
  get simulationsSignal(): Signal<Simulation[]> {
    return computed(() => this._simulationsSignal().sort(sortSimulations));
  }

  get availableSimulationDataSignal(): Signal<string[]> {
    return this._availableSimulationDataSignal;
  }

  // MARK: Communication
  queryAvailableData() {
    this.communicationService.emit('get-available-data');
  }

  private listen() {
    this.communicationService.on('simulation', (data) => {
      const simulation = extractSimulation(data);

      if (simulation === null) {
        console.error('Invalid simulation data', data);
        return;
      }

      this._simulationsSignal.update((simulations) => {
        const index = simulations.findIndex((s) => s.id === simulation.id);

        console.log(simulations, simulation, index);

        if (index !== -1) {
          simulations[index] = simulation;
        } else {
          simulations.push(simulation);
        }

        return [...simulations];
      });
    });

    this.communicationService.on('delete-simulation', (data) => {
      if (typeof data !== 'string') {
        console.error('Invalid delete simulation data', data);
        return;
      }

      const simulationId = data;

      this._simulationsSignal.update((simulations) =>
        simulations.filter((s) => s.id !== simulationId),
      );
    });

    this.communicationService.on('available-data', (data) => {
      if (
        !Array.isArray(data) ||
        !data.every((item) => typeof item === 'string')
      ) {
        console.error('Invalid available data', data);
        return;
      }

      this._availableSimulationDataSignal.set(data);
    });
  }

  private query() {
    this.querySimulations();
    this.queryAvailableData();
  }

  private querySimulations() {
    this.communicationService.emit('get-simulations');
  }
}

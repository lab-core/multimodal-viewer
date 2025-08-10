import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  extractSimulations,
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
    this.communicationService.on('simulations', (data) => {
      const simulations = extractSimulations(data);

      if (simulations === null) {
        console.error('Invalid simulations data', data);
        return;
      }

      this._simulationsSignal.set(simulations);
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

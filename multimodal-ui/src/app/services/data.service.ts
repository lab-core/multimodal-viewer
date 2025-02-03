import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { Simulation } from '../interfaces/simulation.model';
import { CommunicationService } from './communication.service';

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private readonly _simulationsSignal: WritableSignal<Simulation[]> = signal(
    [],
  );

  private readonly _availableSimulationDataSignal: WritableSignal<string[]> =
    signal([]);

  constructor(private readonly communicationService: CommunicationService) {
    this.listen();

    this.query();

    this.communicationService.onConnect(() => {
      this.query();
    });
  }

  get simulationsSignal(): Signal<Simulation[]> {
    return this._simulationsSignal;
  }

  get availableSimulationDataSignal(): Signal<string[]> {
    return this._availableSimulationDataSignal;
  }

  private listen() {
    this.communicationService.on('simulations', (simulations) => {
      this._simulationsSignal.set(simulations as Simulation[]);
    });

    this.communicationService.on('availableData', (availableData) => {
      this._availableSimulationDataSignal.set(
        (availableData as string[]).sort(),
      );
    });
  }

  private query() {
    this.communicationService.emit('getSimulations');
    this.communicationService.emit('getAvailableData');
  }
}

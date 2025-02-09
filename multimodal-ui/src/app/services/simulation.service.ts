import {
  computed,
  effect,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { Simulation } from '../interfaces/simulation.model';
import { CommunicationService } from './communication.service';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root',
})
export class SimulationService {
  private readonly _activeSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

  private activeSimulationId: string | null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly communicationService: CommunicationService,
  ) {
    this.communicationService['socket'].onAny((event, ...args) => {
      console.log('socket event', event, args);
    });
    effect(() => {
      const activeSimulationId = this._activeSimulationIdSignal();
      if (activeSimulationId) {
        this.communicationService.on(
          'simulationUpdate' + activeSimulationId,
          (update) => {
            console.log('updateSimulation', update);
          },
        );

        this.activeSimulationId = activeSimulationId;
      } else if (this.activeSimulationId) {
        this.communicationService.removeAllListeners(
          'simulationUpdate' + this.activeSimulationId,
        );
        this.activeSimulationId = null;
      }
    });
  }

  setActiveSimulationId(simulationId: string) {
    this._activeSimulationIdSignal.set(simulationId);
  }

  unsetActiveSimulationId() {
    this._activeSimulationIdSignal.set(null);
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
}

import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { Simulation } from '../interfaces/simulation.model';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root',
})
export class SimulationService {
  constructor(private readonly dataService: DataService) {}

  private readonly _activeSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

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
        // TODO Change to id
        (simulation) => simulation.name === activeSimulationId,
      );

      return currentSimulation ?? null;
    });
  }
}

import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { SimulationService } from '../services/simulation.service';

export const loadActiveSimulationGuard: CanActivateFn = (route, state) => {
  const simulationId: string = route.params['simulationId'] as string;

  const simulationService: SimulationService = inject(SimulationService);

  simulationService.setActiveSimulationId(simulationId);
  return true;
};

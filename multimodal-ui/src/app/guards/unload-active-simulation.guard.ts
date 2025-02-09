import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { SimulationService } from '../services/simulation.service';

export const unloadActiveSimulationGuard: CanDeactivateFn<unknown> = (
  component,
  currentRoute,
  currentState,
  nextState,
) => {
  const simulationService: SimulationService = inject(SimulationService);

  simulationService.unsetActiveSimulationId();
  return true;
};

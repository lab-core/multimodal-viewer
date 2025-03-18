import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { AnimationService } from '../services/animation.service';

export const clearMapGuard: CanDeactivateFn<unknown> = (
  component,
  currentRoute,
  currentState,
  nextState,
) => {
  const animationService: AnimationService = inject(AnimationService);

  animationService.clearAnimations();
  return true;
};

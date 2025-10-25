import {
  effect,
  inject,
  Injectable,
  signal,
  Signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { AnimationService } from './animation.service';
import { VisualizationService } from './visualization.service';

@Injectable()
export class VisualizationFilterService {
  readonly visualizationService = inject(VisualizationService);
  readonly animationService = inject(AnimationService);

  private _filters: WritableSignal<Set<string>> = signal(
    new Set<string>(['stops']),
  );

  private _vehicleModes: WritableSignal<string[]> = signal([]);

  get filters(): Signal<Set<string>> {
    return this._filters;
  }

  get vehicleModes(): Signal<string[]> {
    return this._vehicleModes;
  }

  constructor() {
    effect(() => {
      this.effectUpdateVehicleModeFilters();
    });

    effect(() => {
      this.effectOnFilterChanged();
    });
  }

  private effectOnFilterChanged() {
    // this.animationService.setFilters(this._filters());
  }

  private effectUpdateVehicleModeFilters() {
    const environment = this.visualizationService.environmentSignal();

    const vehicleModes = untracked(this._vehicleModes);

    if (environment === null) return;

    // Get unique vehicle modes
    const currentModes = Object.values(environment.vehicles).map(
      (vehicle) => vehicle.mode ?? 'unknown',
    );

    // Combine current modes and previous modes then get uniques
    const allModes = [...currentModes, ...vehicleModes].filter(
      (value, index, self) => self.indexOf(value) === index,
    );

    allModes.sort();

    this._vehicleModes.set(allModes);
  }

  toggleFilter(name: string) {
    const filters = this._filters();

    if (filters.has(name)) filters.delete(name);
    else filters.add(name);

    this._filters.set(new Set(filters));
  }
}

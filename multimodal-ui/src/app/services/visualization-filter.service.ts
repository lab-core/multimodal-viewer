import {
  effect,
  Injectable,
  signal,
  Signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { VisualizationService } from './visualization.service';

@Injectable()
export class VisualizationFilterService {
  private _filters: WritableSignal<Set<string>> = signal(new Set<string>());

  private _vehicleModes: WritableSignal<string[]> = signal([]);

  get filters(): Signal<Set<string>> {
    return this._filters;
  }

  get vehicleModes(): Signal<string[]> {
    return this._vehicleModes;
  }

  constructor(readonly visualizationService: VisualizationService) {
    effect(() => {
      this.effectUpdateVehicleModeFilters();
    });
  }

  private effectUpdateVehicleModeFilters() {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();

    const vehicleModes = untracked(this._vehicleModes);

    if (visualizationEnvironment === null) return;

    // Get unique vehicle modes
    const currentModes = Object.values(visualizationEnvironment.vehicles).map(
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

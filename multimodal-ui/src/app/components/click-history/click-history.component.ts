import {
  Component,
  effect,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EntityMetadata } from '../../interfaces/entity.model';
import { AnimationService } from '../../services/animation.service';
import { VisualizationService } from '../../services/visualization.service';
import { EntityNameComponent } from '../entity-name/entity-name.component';

@Component({
  selector: 'app-click-history',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
    EntityNameComponent,
  ],
  templateUrl: './click-history.component.html',
  styleUrl: './click-history.component.scss',
})
export class ClickHistoryComponent {
  history: WritableSignal<EntityMetadata[]> = signal([]);

  // Don't make selects from the history change the order of the history
  _ignoreNextSelect = false;

  constructor(
    private readonly visualizationService: VisualizationService,
    private readonly animationService: AnimationService,
  ) {
    effect(() => {
      this.effectOnVehicleSelected();
    });

    effect(() => {
      this.effectOnPassengerSelected();
    });

    effect(() => {
      this.effectOnStopSelected();
    });
  }

  clearHistory() {
    this.history.set([]);
  }

  unpreselectEntity() {
    this.animationService.unpreselectEntity();
  }

  preselectEntity(entity: EntityMetadata) {
    this.animationService.preselectEntity(entity, true);
  }

  selectEntity(entity: EntityMetadata) {
    this._ignoreNextSelect = true;
    this.animationService.selectEntity(entity.id, entity.entityType);
  }

  private getVehicle(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return undefined;

    return visualizationEnvironment.vehicles[id];
  }

  private getPassenger(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return undefined;

    return visualizationEnvironment.passengers[id];
  }

  private getStop(id: string) {
    const visualizationEnvironment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (!visualizationEnvironment) return undefined;

    return visualizationEnvironment.stops[id];
  }

  private effectOnVehicleSelected() {
    const vehicleId = this.animationService.selectedVehicleIdSignal();
    if (vehicleId === null) return;

    if (this._ignoreNextSelect) {
      this._ignoreNextSelect = false;
      return;
    }

    const vehicle = untracked(() => this.getVehicle(vehicleId));
    if (vehicle == null) return;

    this.addHistory(vehicle);
  }

  private effectOnPassengerSelected() {
    const passengerId = this.animationService.selectedPassengerIdSignal();
    if (passengerId === null) return;

    if (this._ignoreNextSelect) {
      this._ignoreNextSelect = false;
      return;
    }

    const passenger = untracked(() => this.getPassenger(passengerId));
    if (passenger == null) return;

    this.addHistory(passenger);
  }

  private effectOnStopSelected() {
    const stopId = this.animationService.selectedStopIdSignal();
    if (stopId === null) return;

    if (this._ignoreNextSelect) {
      this._ignoreNextSelect = false;
      return;
    }

    const stop = untracked(() => this.getStop(stopId));
    if (stop == null) return;

    this.addHistory(stop);
  }

  private addHistory(entity: EntityMetadata) {
    this.history.update((history) => {
      const index = history.findIndex(
        (historyItem) => historyItem.id === entity.id,
      );

      if (index !== -1) history.splice(index, 1);

      return [
        {
          id: entity.id,
          name: entity.name,
          entityType: entity.entityType,
          tags: entity.tags,
        },
        ...history,
      ];
    });
  }
}

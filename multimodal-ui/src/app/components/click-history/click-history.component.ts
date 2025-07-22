import { Component, effect, signal, WritableSignal } from '@angular/core';
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
      this.effectOnEntitySelected();
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
    this.animationService.selectEntity(entity);
  }

  private effectOnEntitySelected() {
    const entity = this.animationService.selectedEntitySignal();
    if (entity === null) return;

    if (this._ignoreNextSelect) {
      this._ignoreNextSelect = false;
      return;
    }

    this.addHistory(entity);
  }

  private addHistory(entity: EntityMetadata) {
    this.history.update((history) => {
      const index = history.findIndex(
        (historyItem) =>
          historyItem.id === entity.id &&
          historyItem.entityType === entity.entityType,
      );

      if (index !== -1) history.splice(index, 1);

      return [entity, ...history];
    });
  }
}

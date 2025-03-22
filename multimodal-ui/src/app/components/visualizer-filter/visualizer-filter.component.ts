import { Component, Signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { VisualizationFilterService } from '../../services/visualization-filter.service';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { AnimationService } from '../../services/animation.service';
import { EntityFilterMode } from '../../interfaces/entity.model';

@Component({
  selector: 'app-visualizer-filter',
  imports: [
    MatCardModule,
    MatCheckboxModule,
    MatRadioModule,
    MatChipsModule,
    MatDividerModule,
  ],
  templateUrl: './visualizer-filter.component.html',
  styleUrl: './visualizer-filter.component.css',
})
export class VisualizerFilterComponent {
  filters: Signal<Set<string>>;
  vehicleModes: Signal<string[]>;

  constructor(
    readonly visualizationFilterService: VisualizationFilterService,
    private readonly animationService: AnimationService,
  ) {
    this.filters = visualizationFilterService.filters;
    this.vehicleModes = visualizationFilterService.vehicleModes;

    this.animationService.setFilterMode('all');
  }

  onRadioChange(change: MatRadioChange) {
    this.animationService.setFilterMode(change.value as EntityFilterMode);
  }
}

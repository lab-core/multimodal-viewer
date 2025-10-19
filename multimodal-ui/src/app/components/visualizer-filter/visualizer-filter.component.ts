import { Component, OnInit, Signal, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { EntityFilterMode } from '../../interfaces/entity.model';
import { AnimationService } from '../../services/animation.service';
import { VisualizationFilterService } from '../../services/visualization-filter.service';

@Component({
  selector: 'app-visualizer-filter',
  imports: [
    MatCardModule,
    MatCheckboxModule,
    MatRadioModule,
    MatChipsModule,
    MatDividerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './visualizer-filter.component.html',
  styleUrl: './visualizer-filter.component.css',
})
export class VisualizerFilterComponent implements OnInit {
  readonly visualizationFilterService = inject(VisualizationFilterService);
  private readonly animationService = inject(AnimationService);

  readonly filters: Signal<Set<string>> =
    this.visualizationFilterService.filters;
  readonly vehicleModes: Signal<string[]> =
    this.visualizationFilterService.vehicleModes;

  ngOnInit() {
    this.animationService.setFilterMode('all');
  }

  onRadioChange(change: MatRadioChange) {
    this.animationService.setFilterMode(change.value as EntityFilterMode);
  }

  onShouldShowCompleteChange(event: MatSlideToggleChange) {
    this.animationService.setShouldShowComplete(event.checked);
  }
}

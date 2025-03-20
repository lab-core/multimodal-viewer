import { Component, Signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { VisualizationFilterService } from '../../services/visualization-filter.service';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-visualizer-filter',
  imports: [MatCardModule, MatCheckboxModule, MatButtonModule],
  templateUrl: './visualizer-filter.component.html',
  styleUrl: './visualizer-filter.component.css',
})
export class VisualizerFilterComponent {
  filters: Signal<Set<string>>;
  vehicleModes: Signal<string[]>;

  constructor(readonly visualizationFilterService: VisualizationFilterService) {
    this.filters = visualizationFilterService.filters;
    this.vehicleModes = visualizationFilterService.vehicleModes;
  }
}

import { Component, Input } from '@angular/core';
import { Stop } from '../../interfaces/simulation.model';

@Component({
  selector: 'app-selected-entity-route',
  imports: [],
  templateUrl: './selected-entity-route.component.html',
  styleUrl: './selected-entity-route.component.css',
})
export class SelectedEntityRouteComponent {
  @Input() previousStops: Stop[];
  @Input() currentStop: Stop | null;
  @Input() nextStops: Stop[];

  constructor() {
    this.previousStops = [];
    this.currentStop = null;
    this.nextStops = [];
  }
}

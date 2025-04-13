import { Component, Input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Stop } from '../../interfaces/simulation.model';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-selected-entity-route',
  imports: [MatTooltipModule],
  templateUrl: './selected-entity-route.component.html',
  styleUrl: './selected-entity-route.component.css',
})
export class SelectedEntityRouteComponent {
  @Input() previousStops: Stop[];
  @Input() currentStop: Stop | null;
  @Input() nextStops: Stop[];

  constructor(private animationService: AnimationService) {
    this.previousStops = [];
    this.currentStop = null;
    this.nextStops = [];
  }

  selectStop(stop: Stop) {
    this.animationService.selectEntity(stop.id, 'stop');
  }
}

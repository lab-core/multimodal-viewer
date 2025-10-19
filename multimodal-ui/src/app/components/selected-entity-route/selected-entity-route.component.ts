import { Component, inject, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Stop } from '../../interfaces/stop.model';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-selected-entity-route',
  imports: [MatTooltipModule],
  templateUrl: './selected-entity-route.component.html',
  styleUrl: './selected-entity-route.component.css',
})
export class SelectedEntityRouteComponent {
  private animationService = inject(AnimationService);

  readonly previousStopsSignal = input.required<Stop[]>({
    alias: 'previousStops',
  });
  readonly currentStopSignal = input.required<Stop | null>({
    alias: 'currentStop',
  });
  readonly nextStopsSignal = input.required<Stop[]>({ alias: 'nextStops' });

  unpreselectStop() {
    this.animationService.unpreselectEntity();
  }

  preselectStop(stop: Stop) {
    this.animationService.preselectEntity(stop, false);
  }

  selectStop(stop: Stop) {
    this.animationService.selectEntity(stop);
  }
}

import {
  Component,
  computed,
  input,
  InputSignal,
  output,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Simulation } from '../../interfaces/simulation.model';

@Component({
  selector: 'app-simulation-control-bar',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSliderModule,
  ],
  templateUrl: './simulation-control-bar.component.html',
  styleUrl: './simulation-control-bar.component.css',
})
export class SimulationControlBarComponent {
  readonly currentTimeSignal: WritableSignal<Date> = signal<Date>(new Date());

  readonly simulationInputSignal: InputSignal<Simulation> =
    // eslint-disable-next-line @angular-eslint/no-input-rename
    input.required<Simulation>({ alias: 'simulation' });

  readonly isPausedSignal: Signal<boolean> = computed(
    () => this.simulationInputSignal().status === 'paused',
  );

  readonly pauseSimulationOutput = output<string>({ alias: 'pauseSimulation' });

  readonly resumeSimulationOutput = output<string>({
    alias: 'resumeSimulation',
  });

  readonly stopSimulationOutput = output<string>({ alias: 'stopSimulation' });

  readonly leaveVisualizationOutput = output<void>({
    alias: 'leaveVisualization',
  });

  toggleSimulationPause(wasPaused: boolean, id: string): void {
    if (wasPaused) {
      this.resumeSimulationOutput.emit(id);
    } else {
      this.pauseSimulationOutput.emit(id);
    }
  }

  stopSimulation(id: string) {
    this.stopSimulationOutput.emit(id);
  }

  leaveVisualization(): void {
    this.leaveVisualizationOutput.emit();
  }

  sliderLabelFormatter(value: number): string {
    return `${value}%`;
  }
}

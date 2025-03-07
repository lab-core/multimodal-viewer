import {
  Component,
  computed,
  input,
  InputSignal,
  output,
  Signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Simulation } from '../../interfaces/simulation.model';
import { VisualizationService } from '../../services/visualization.service';

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
  // MARK: Properties
  readonly isSimulationPausedSignal: Signal<boolean> = computed(
    () => this.simulationInputSignal().status === 'paused',
  );

  // MARK: Inputs
  readonly simulationInputSignal: InputSignal<Simulation> =
    input.required<Simulation>({ alias: 'simulation' });

  // MARK: Outputs
  readonly pauseSimulationOutput = output<string>({ alias: 'pauseSimulation' });

  readonly resumeSimulationOutput = output<string>({
    alias: 'resumeSimulation',
  });

  readonly stopSimulationOutput = output<string>({ alias: 'stopSimulation' });

  readonly leaveVisualizationOutput = output<void>({
    alias: 'leaveVisualization',
  });

  readonly editSimulationConfigurationOutput = output<Simulation>({
    alias: 'editSimulationConfiguration',
  });

  // MARK: Constructor
  constructor(private readonly visualizationService: VisualizationService) {}

  // MARK: Getters
  get isInitializedSignal(): Signal<boolean> {
    return this.visualizationService.isInitializedSignal;
  }

  get simulationStartTimeSignal(): Signal<number | null> {
    return this.visualizationService.simulationStartTimeSignal;
  }

  get simulationEndTimeSignal(): Signal<number | null> {
    return this.visualizationService.simulationEndTimeSignal;
  }

  get visualizationMaxTimeSignal(): Signal<number | null> {
    return this.visualizationService.visualizationMaxTimeSignal;
  }

  get isVisualizationPausedSignal(): Signal<boolean> {
    return this.visualizationService.isVisualizationPausedSignal;
  }

  get visualizationTimeSignal(): Signal<number | null> {
    return this.visualizationService.visualizationTimeSignal;
  }

  // MARK: Handlers
  toggleVisualizationPause(wasPaused: boolean): void {
    if (wasPaused) {
      this.visualizationService.resumeVisualization();
    } else {
      this.visualizationService.pauseVisualization();
    }
  }

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

  editSimulationConfiguration(simulation: Simulation) {
    this.editSimulationConfigurationOutput.emit(simulation);
  }

  leaveVisualization(): void {
    this.leaveVisualizationOutput.emit();
  }

  onSliderChange(value: number) {
    this.visualizationService.setVisualizationTime(value);
  }

  // MARK: Other
  sliderLabelFormatter(min: number, max: number): (value: number) => string {
    return (value: number) => {
      return Math.floor((100 * (value - min)) / (max - min)) + '%';
    };
  }
}

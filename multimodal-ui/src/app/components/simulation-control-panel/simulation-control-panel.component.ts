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
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  Simulation,
  SimulationStatus,
} from '../../interfaces/simulation.model';
import { SimulationTimePipe } from '../../pipes/simulation-time.pipe';
import { VisualizationService } from '../../services/visualization.service';

@Component({
  selector: 'app-simulation-control-panel',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    SimulationTimePipe,
    MatChipsModule,
  ],
  templateUrl: './simulation-control-panel.component.html',
  styleUrl: './simulation-control-panel.component.css',
})
export class SimulationControlPanelComponent {
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

  readonly editSimulationConfigurationOutput = output<Simulation>({
    alias: 'editSimulationConfiguration',
  });

  // MARK: Constructor
  constructor(private readonly visualizationService: VisualizationService) {}

  // MARK: Getters
  get isInitializedSignal(): Signal<boolean> {
    return this.visualizationService.isInitializedSignal;
  }

  get isVisualizationPausedSignal(): Signal<boolean> {
    return this.visualizationService.isVisualizationPausedSignal;
  }

  // MARK: Handlers
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

  // MARK: Other
  getSimulationStatusColor(
    status: SimulationStatus,
  ): 'green' | 'red' | 'yellow' | 'gray' {
    switch (status) {
      case 'running':
        return 'green';
      case 'paused':
        return 'yellow';
      case 'stopping':
      case 'starting':
      case 'completed':
        return 'gray';
      default:
        return 'red';
    }
  }
}

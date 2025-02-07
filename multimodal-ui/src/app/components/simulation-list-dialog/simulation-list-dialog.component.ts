import { Component, computed, Signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { Simulation } from '../../interfaces/simulation.model';
import { CommunicationService } from '../../services/communication.service';
import { DataService } from '../../services/data.service';
import { DialogService } from '../../services/dialog.service';

export type SimulationListDialogData = null;

export interface SimulationListDialogResult {
  simulationToVisualize: Simulation | null;
}

@Component({
  selector: 'app-simulation-list-dialog',
  imports: [
    MatDialogActions,
    MatDialogClose,
    MatDialogTitle,
    MatDialogContent,
    MatButtonModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatCheckboxModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './simulation-list-dialog.component.html',
  styleUrl: './simulation-list-dialog.component.css',
})
export class SimulationListDialogComponent {
  constructor(
    private readonly dataService: DataService,
    private readonly communicationService: CommunicationService,
    private readonly dialogService: DialogService,
    private readonly matDialogRef: MatDialogRef<SimulationListDialogComponent>,
  ) {}

  private get simulationsSignal(): Signal<Simulation[]> {
    return this.dataService.simulationsSignal;
  }

  get runningSimulationsSignal(): Signal<Simulation[]> {
    return computed(() =>
      this.simulationsSignal()
        .filter(
          (simulation) =>
            simulation.status === 'running' || simulation.status === 'paused',
        )
        .sort((a, b) => a.completion - b.completion),
    );
  }

  get completedSimulationsSignal(): Signal<Simulation[]> {
    return computed(() =>
      this.simulationsSignal().filter(
        (simulation) => simulation.status === 'completed',
      ),
    );
  }

  visualizeSimulation(simulation: Simulation): void {
    this.matDialogRef.close({ simulationToVisualize: simulation });
  }

  async stopSimulation(simulation: Simulation): Promise<void> {
    const result = await firstValueFrom(
      this.dialogService
        .openConfirmationDialog({
          title: 'Stopping Simulation',
          message:
            'Are you sure you want to stop the simulation? This action cannot be undone.',
        })
        .afterClosed(),
    );

    if (!result) {
      return;
    }

    this.communicationService.emit('stopSimulation', simulation.name);
  }
}

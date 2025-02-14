import { TitleCasePipe } from '@angular/common';
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
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import {
  RUNNING_SIMULATION_STATUSES,
  Simulation,
} from '../../interfaces/simulation.model';
import { CommunicationService } from '../../services/communication.service';
import { DataService } from '../../services/data.service';
import { DialogService } from '../../services/dialog.service';

export type SimulationListDialogData = null;

export interface SimulationListDialogResult {
  simulationToVisualize: Simulation | null;
}

export type SimulationListGroup = 'running' | 'completed';

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
    MatDividerModule,
    TitleCasePipe,
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

  get groupedSimulationsSignal(): Signal<
    {
      group: SimulationListGroup;
      simulations: Simulation[];
    }[]
  > {
    return computed(() => {
      const simulations = this.simulationsSignal();
      const runningSimulations = simulations.filter((simulation) =>
        RUNNING_SIMULATION_STATUSES.includes(simulation.status),
      );
      const completedSimulations = simulations.filter(
        (simulation) =>
          !RUNNING_SIMULATION_STATUSES.includes(simulation.status),
      );

      return [
        {
          group: 'running',
          simulations: runningSimulations,
        },
        {
          group: 'completed',
          simulations: completedSimulations,
        },
      ];
    });
  }

  getColorFromStatus(status: Simulation['status']): string {
    switch (status) {
      case 'running':
        return 'green';

      case 'paused':
        return 'yellow';

      case 'starting':
      case 'stopping':
        return 'gray';

      case 'completed':
        return 'blue';

      case 'lost':
      case 'corrupted':
        return 'red';
    }
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

    this.communicationService.emit('stop-simulation', simulation.id);
  }

  visualizeSimulation(simulation: Simulation): void {
    this.matDialogRef.close({ simulationToVisualize: simulation });
  }

  private get simulationsSignal(): Signal<Simulation[]> {
    return this.dataService.simulationsSignal;
  }
}

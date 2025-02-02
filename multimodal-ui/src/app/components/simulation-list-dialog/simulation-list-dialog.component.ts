import { Component, computed, signal, Signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

// TODO
export interface Simulation {
  name: string;
  data: string;
  completion: number;
  status: 'paused' | 'running' | 'completed';
}

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
  simulationsSignal: Signal<Simulation[]> = signal([
    {
      name: 'Simulation 1',
      data: 'Data 1',
      status: 'paused',
      completion: 50,
    },
    {
      name: 'Simulation 2',
      data: 'Data 2',
      status: 'running',
      completion: 25,
    },
    {
      name: 'Simulation 3',
      data: 'Data 3',
      status: 'completed',
      completion: 100,
    },
    {
      name: 'Simulation 4',
      data: 'Data 4',
      status: 'completed',
      completion: 100,
    },
    {
      name: 'Simulation 5',
      data: 'Data 5',
      status: 'running',
      completion: 90,
    },
    {
      name: 'Simulation 6',
      data: 'Data 6',
      status: 'completed',
      completion: 100,
    },
    {
      name: 'Simulation 7',
      data: 'Data 7',
      status: 'completed',
      completion: 100,
    },
    {
      name: 'Simulation 8',
      data: 'Data 8',
      status: 'completed',
      completion: 100,
    },
    {
      name: 'Simulation 9',
      data: 'Data 9',
      status: 'completed',
      completion: 100,
    },
    {
      name: 'Simulation 10',
      data: 'Data 10',
      status: 'completed',
      completion: 100,
    },
    {
      name: 'Simulation 11',
      data: 'Data 11',
      status: 'completed',
      completion: 100,
    },
  ]);

  runningSimulationsSignal: Signal<Simulation[]> = computed(() =>
    this.simulationsSignal()
      .filter(
        (simulation) =>
          simulation.status === 'running' || simulation.status === 'paused'
      )
      .sort((a, b) => a.completion - b.completion)
  );

  completedSimulationsSignal: Signal<Simulation[]> = computed(() =>
    this.simulationsSignal().filter(
      (simulation) => simulation.status === 'completed'
    )
  );
}

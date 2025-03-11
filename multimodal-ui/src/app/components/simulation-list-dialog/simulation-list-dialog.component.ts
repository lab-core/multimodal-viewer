import { PercentPipe, TitleCasePipe } from '@angular/common';
import { Component, computed, Signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import JSZip from 'jszip';
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
import { DataService } from '../../services/data.service';
import { DialogService } from '../../services/dialog.service';
import { SimulationService } from '../../services/simulation.service';
import { HttpService } from '../../services/http.service';
import { CommunicationService } from '../../services/communication.service';

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
    PercentPipe,
  ],
  templateUrl: './simulation-list-dialog.component.html',
  styleUrl: './simulation-list-dialog.component.css',
})
export class SimulationListDialogComponent {
  readonly groupedSimulationsSignal: Signal<
    {
      group: SimulationListGroup;
      simulations: Simulation[];
    }[]
  > = computed(() => {
    const simulations = this.simulationsSignal();
    const runningSimulations = simulations.filter((simulation) =>
      RUNNING_SIMULATION_STATUSES.includes(simulation.status),
    );
    const completedSimulations = simulations.filter(
      (simulation) => !RUNNING_SIMULATION_STATUSES.includes(simulation.status),
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
  constructor(
    private readonly dataService: DataService,
    private readonly simulationService: SimulationService,
    private readonly dialogService: DialogService,
    private readonly matDialogRef: MatDialogRef<SimulationListDialogComponent>,
    private httpService: HttpService,
    private communicationService: CommunicationService,
  ) {}

  getColorFromStatus(status: Simulation['status']): string {
    switch (status) {
      case 'running':
        return 'green';

      case 'paused':
        return 'yellow';

      case 'starting':
      case 'stopping':
      case 'outdated':
      case 'future':
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
        .openInformationDialog({
          title: 'Stopping Simulation',
          message:
            'Are you sure you want to stop the simulation? This action cannot be undone.',
          type: 'warning',
          confirmButtonOverride: null,
          cancelButtonOverride: null,
          canCancel: true,
        })
        .afterClosed(),
    );

    if (!result) {
      return;
    }

    this.simulationService.stopSimulation(simulation.id);
  }

  visualizeSimulation(simulation: Simulation): void {
    this.matDialogRef.close({ simulationToVisualize: simulation });
  }

  private get simulationsSignal(): Signal<Simulation[]> {
    return this.dataService.simulationsSignal;
  }

  pauseResumeHandler(simulationId: string, isRunning: boolean) {
    if (isRunning) {
      this.simulationService.pauseSimulation(simulationId);
    } else {
      this.simulationService.resumeSimulation(simulationId);
    }
  }

  importSimulation() {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
  
      const handleFileChange = async (event: Event) => {
          const files = (event.target as HTMLInputElement).files;
          if (!files || files.length === 0) {
              return;
          }
  
          const zip = new JSZip();
          const baseFolder = files[0].webkitRelativePath.split('/')[0]; 
  
          for (const file of Array.from(files)) {
              const relativePath = file.webkitRelativePath.replace(baseFolder + '/', '');
              zip.file(relativePath, file);
          }
  
          const blob = await zip.generateAsync({ type: 'blob' });
          const formData = new FormData();
          formData.append('file', blob, 'folder.zip');
  
          this.httpService.importFolder('simulation', baseFolder, formData).subscribe({
            next: (response: { message?: string; error?: string }) => {
              if (response.message) {
                console.log('Upload successful:', response.message);
                this.communicationService.emit('get-simulations');
              } else if (response.error) {
                console.error('Upload failed:', response.error);
              }
            },
            error: (err) => {
              console.error('HTTP error during upload:', err);
            },
          });
      };
  
      input.addEventListener('change', (event: Event) => {
          handleFileChange(event).catch(error => {
              console.error('Error handling file change:', error);
          });
      });
  
      input.click();
    }

  exportSimulation(name: string) {
    const folderContents = 'simulation'
    this.httpService.exportFolder(folderContents, name).subscribe((response: Blob) => {
      const blob = new Blob([response], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    });
  }

  deleteSimulation(simulationId: string): void {
    const folderContents = 'simulation';
    this.httpService.deleteFolder(folderContents, simulationId).subscribe({
      next: (response: { message?: string; error?: string }) => {
        if (response.message) {
          console.log(response.message);
          this.dataService.removeSimulation(simulationId);
        } else if (response.error) {
          console.error('Failed to delete simulation:', response.error);
        }
      },
      error: (err) => {
        console.error('HTTP error during deletion:', err);
      },
    });
  }
}

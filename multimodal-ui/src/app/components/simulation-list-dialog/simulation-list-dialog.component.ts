import { DatePipe, PercentPipe, TitleCasePipe } from '@angular/common';
import {
  Component,
  computed,
  Injector,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
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
import JSZip from 'jszip';
import { filter, firstValueFrom, take, timeout } from 'rxjs';
import {
  RUNNING_SIMULATION_STATUSES,
  Simulation,
} from '../../interfaces/simulation.model';
import { SimulationTimePipe } from '../../pipes/simulation-time.pipe';
import { DataService } from '../../services/data.service';
import { DialogService } from '../../services/dialog.service';
import { HttpService } from '../../services/http.service';
import { LoadingService } from '../../services/loading.service';
import { SimulationService } from '../../services/simulation.service';
import { SnackBarService } from '../../services/snack-bar.service';

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
    SimulationTimePipe,
    DatePipe,
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

  private readonly _selectedSimulationIdSignal: WritableSignal<string | null> =
    signal(null);

  constructor(
    private readonly dataService: DataService,
    private readonly simulationService: SimulationService,
    private readonly dialogService: DialogService,
    private readonly matDialogRef: MatDialogRef<SimulationListDialogComponent>,
    private readonly httpService: HttpService,
    private readonly snackBarService: SnackBarService,
    private readonly loadingService: LoadingService,
    private readonly injector: Injector,
  ) {}

  get selectedSimulationIdSignal(): Signal<string | null> {
    return this._selectedSimulationIdSignal;
  }

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

  async editSimulationConfiguration(
    simulation: Simulation,
    event: Event,
  ): Promise<void> {
    event.stopPropagation(); // Prevent the click from toggling selection

    const result = await firstValueFrom(
      this.dialogService
        .openSimulationConfigurationDialog({
          mode: 'edit',
          currentConfiguration: simulation.configuration,
        })
        .afterClosed(),
    );

    if (!result) {
      return;
    }

    this.simulationService.editSimulationConfiguration(
      simulation.id,
      result.configuration.maxDuration,
    );
  }

  async stopSimulation(simulationId: string, event: Event): Promise<void> {
    event.stopPropagation(); // Prevent the click from toggling selection

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

    this.simulationService.stopSimulation(simulationId);
  }

  visualizeSimulation(simulation: Simulation, event: Event): void {
    event.stopPropagation(); // Prevent the click from toggling selection

    this.matDialogRef.close({ simulationToVisualize: simulation });
  }

  private get simulationsSignal(): Signal<Simulation[]> {
    return this.dataService.simulationsSignal;
  }

  pauseResumeHandler(simulationId: string, isRunning: boolean, event: Event) {
    event.stopPropagation(); // Prevent the click from toggling selection

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
      try {
        const files = (event.target as HTMLInputElement).files;
        if (!files || files.length === 0) {
          return;
        }

        this.loadingService.start('Uploading simulation folder...');

        const zip = new JSZip();
        const baseFolder = files[0].webkitRelativePath.split('/')[0];

        for (const file of Array.from(files)) {
          const relativePath = file.webkitRelativePath.replace(
            baseFolder + '/',
            '',
          );
          zip.file(relativePath, file);
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const formData = new FormData();
        formData.append('file', blob, 'folder.zip');

        const response = await firstValueFrom(
          this.httpService.importFolder('simulation', baseFolder, formData),
        );

        await this.waitForSimulationToAppear(response.folderName);

        this.snackBarService.showMessage('Upload successful', 'success');
      } catch (error) {
        console.error('HTTP error during upload:', error);
        this.snackBarService.showMessage('Upload failed', 'error');
      } finally {
        this.loadingService.stop();
      }
    };

    input.addEventListener('change', (event: Event) => {
      handleFileChange(event).catch((error) => {
        console.error('Error handling file change:', error);
      });
    });

    input.click();
  }

  async exportSimulation(simulationId: string, event: Event) {
    event.stopPropagation(); // Prevent the click from toggling selection

    try {
      this.loadingService.start('Exporting simulation folder...');

      const folderContents = 'simulation';
      const response = await firstValueFrom(
        this.httpService.exportFolder(folderContents, simulationId),
      );

      const blob = new Blob([response], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = simulationId + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      this.snackBarService.showMessage('Export successful', 'success');
    } catch (error) {
      console.error('HTTP error during export:', error);
      this.snackBarService.showMessage('Export failed', 'error');
    } finally {
      this.loadingService.stop();
    }
  }

  async deleteSimulation(
    simulationId: string,
    simulationName: string,
    event: Event,
  ) {
    event.stopPropagation(); // Prevent the click from toggling selection

    const shouldContinue = await firstValueFrom(
      this.dialogService
        .openInformationDialog({
          title: 'Deleting Saved Simulation',
          message: `Are you sure you want to delete the simulation "${simulationName}"? This action cannot be undone.`,
          type: 'warning',
          confirmButtonOverride: null,
          cancelButtonOverride: null,
          canCancel: true,
        })
        .afterClosed(),
    );

    if (!shouldContinue) {
      return;
    }

    try {
      this.loadingService.start('Deleting simulation folder...');

      const folderContents = 'simulation';

      await firstValueFrom(
        this.httpService.deleteFolder(folderContents, simulationId),
      );

      await this.waitForSimulationToDisappear(simulationId);

      this.snackBarService.showMessage('Deletion successful', 'success');
    } catch (error) {
      console.error('HTTP error during deletion:', error);
      this.snackBarService.showMessage('Deletion failed', 'error');
    } finally {
      this.loadingService.stop();
    }
  }

  getDuration(simulation: Simulation): number {
    if (simulation.simulationStartTime === null) {
      return 0;
    }

    if (simulation.simulationEndTime !== null) {
      return simulation.simulationEndTime - simulation.simulationStartTime;
    }

    if (simulation.simulationTime !== null) {
      return simulation.simulationTime - simulation.simulationStartTime;
    }

    return 0;
  }

  megabytes(bytes: number | null): string {
    if (bytes === null || bytes < 0) {
      return 'unknown';
    }
    const megabytes = bytes / (1024 * 1024);
    return `${megabytes.toFixed(2)} MB`;
  }

  toggleSelection(simulationId: string | null): void {
    if (this._selectedSimulationIdSignal() === simulationId) {
      this._selectedSimulationIdSignal.set(null);
    } else {
      this._selectedSimulationIdSignal.set(simulationId);
    }
  }

  async copyToClipboard(text: string, event: Event): Promise<void> {
    event.stopPropagation(); // Prevent the click from toggling selection

    try {
      await navigator.clipboard.writeText(text);

      this.snackBarService.showMessage('Copied to clipboard!', 'info');
    } catch (error) {
      console.error('Failed to copy text: ', error);
      this.snackBarService.showMessage('Failed to copy!', 'error');
    }
  }

  isSimulationRunning(simulation: Simulation): boolean {
    return RUNNING_SIMULATION_STATUSES.includes(simulation.status);
  }

  private async waitForSimulationToAppear(simulationId: string) {
    return await new Promise((resolve, reject) => {
      toObservable(this.dataService.simulationsSignal, {
        injector: this.injector,
      })
        .pipe(
          filter((simulations) =>
            simulations.some((simulation) => simulation.id === simulationId),
          ),
          timeout({ first: 3000 }),
          take(1),
        )
        .subscribe({
          next: (data) => resolve(data),
          error: () => reject(new Error('Timeout waiting for available data')),
        });
    });
  }

  private async waitForSimulationToDisappear(simulationId: string) {
    return await new Promise((resolve, reject) => {
      toObservable(this.dataService.simulationsSignal, {
        injector: this.injector,
      })
        .pipe(
          filter((simulations) =>
            simulations.every((simulation) => simulation.id !== simulationId),
          ),
          timeout({ first: 3000 }),
          take(1),
        )
        .subscribe({
          next: (data) => resolve(data),
          error: () => reject(new Error('Timeout waiting for available data')),
        });
    });
  }
}

import { Component, computed, effect, OnDestroy, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  Simulation,
  SimulationEnvironment,
  SimulationStatus,
} from '../../interfaces/simulation.model';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SimulationService } from '../../services/simulation.service';
import { UserInterfaceService } from '../../services/user-interface.service';
import { VisualizationService } from '../../services/visualization.service';
import { InformationDialogComponent } from '../information-dialog/information-dialog.component';
import { SimulationControlBarComponent } from '../simulation-control-bar/simulation-control-bar.component';
import { AnimationService } from '../../services/animation.service';
import { MatChipsModule } from '@angular/material/chips';

export type VisualizerStatus = SimulationStatus | 'not-found' | 'disconnected';

@Component({
  selector: 'app-visualizer',
  imports: [
    SimulationControlBarComponent,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatChipsModule,
  ],
  providers: [VisualizationService],
  templateUrl: './visualizer.component.html',
  styleUrl: './visualizer.component.css',
})
export class VisualizerComponent implements OnDestroy {
  // MARK: Properties
  readonly simulationSignal: Signal<Simulation | null>;

  private matDialogRef: MatDialogRef<InformationDialogComponent> | null = null;

  private readonly visualizerStatusSignal: Signal<VisualizerStatus> = computed(
    () => {
      const isConnected = this.communicationService.isConnectedSignal();

      if (!isConnected) {
        return 'disconnected';
      }

      const simulation = this.simulationSignal();

      if (simulation) {
        return simulation.status;
      }
      return 'not-found';
    },
  );

  // MARK: Constructor
  constructor(
    private readonly simulationService: SimulationService,
    private readonly userInterfaceService: UserInterfaceService,
    private readonly router: Router,
    private readonly communicationService: CommunicationService,
    private readonly dialogService: DialogService,
    private readonly animationService: AnimationService,
    private readonly loadingService: LoadingService,
    private readonly visualizationService: VisualizationService,
  ) {
    this.simulationSignal = this.simulationService.activeSimulationSignal;

    // MARK: Effects
    effect(() => {
      const visualizationTimeSignal = this.visualizationService.visualizationTimeSignal();
      if (visualizationTimeSignal == null) return;
      this.animationService.synchronizeTime(visualizationTimeSignal);
    })

    effect(() => {
      const visualizationEnvironmentSignal = this.visualizationEnvironmentSignal();
      if (visualizationEnvironmentSignal == null) return;
      this.animationService.synchronizeEnvironment(visualizationEnvironmentSignal);
    });

    effect(() => {
      const isVisualizationPausedSignal = this.visualizationService.isVisualizationPausedSignal();
      this.animationService.setPause(isVisualizationPausedSignal);
    })

    effect(() => {
      const status = this.visualizerStatusSignal();

      if (this.matDialogRef) {
        const matDialogRef = this.matDialogRef;
        this.matDialogRef = null;
        matDialogRef.close(null);
      }
      this.loadingService.stop();

      switch (status) {
        case 'disconnected':
        case 'running':
        case 'paused':
          return;

        case 'not-found':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation not found',
            message:
              'The simulation you are trying to visualize is not available for now. Please verify the URL.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'completed':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation completed',
            message:
              'The simulation has been completed. You can continue the visualization or go back to the home page.',
            type: 'info',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: 'Stay here',
            canCancel: true,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'starting':
          this.loadingService.start('Starting simulation...');
          return;

        case 'stopping':
          this.loadingService.start('Stopping simulation...');
          return;

        case 'lost':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation lost',
            message:
              'The simulation you are trying to visualize has been disconnected from the server. You can continue the visualization or go back to the home page.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: 'Stay here',
            canCancel: true,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'corrupted':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation corrupted',
            message: 'The file containing the simulation data is corrupted.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'outdated':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Unsupported simulation version',
            message:
              'The version of the file containing the simulation data is too old for this version of the application.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'future':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Unsupported simulation version',
            message:
              'The version of the file containing the simulation data is too recent for this version of the application.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
      }
    });

    effect(() => {
      const status = this.visualizerStatusSignal();

      const simulation = this.simulationSignal();
      if (!simulation) {
        return;
      }

      switch (status) {
        case 'running':
        case 'paused':
        case 'completed':
        case 'starting':
        case 'stopping':
        case 'lost':
          this.visualizationService.init(simulation);
          return;

        case 'disconnected':
        case 'not-found':
        case 'corrupted':
        case 'outdated':
        case 'future':
      }

      this.visualizationService.destroy();
    });
  }

  // MARK: Lifecycle
  ngOnDestroy() {
    this.visualizationService.destroy();
  }

  // MARK: Getters
  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowInformationPanelSignal;
  }

  get isInitializedSignal(): Signal<boolean> {
    return this.visualizationService.isInitializedSignal;
  }

  get visualizationEnvironmentSignal(): Signal<SimulationEnvironment | null> {
    return this.visualizationService.visualizationEnvironmentSignal;
  }

  get numberOfPassengersByStatusSignal(): Signal<
    {
      status: string;
      count: number;
    }[]
  > {
    return computed(() => {
      const environment = this.visualizationEnvironmentSignal();
      if (!environment) {
        return [];
      }

      const passengers = environment.passengers;
      const counts: Record<string, number> = {};

      for (const passenger of Object.values(passengers)) {
        const status = passenger.status;
        counts[status] = (counts[status] ?? 0) + 1;
      }

      return Object.entries(counts).map(([status, count]) => ({
        status,
        count,
      }));
    });
  }

  get numberOfVehiclesByStatusSignal(): Signal<
    {
      status: string;
      count: number;
    }[]
  > {
    return computed(() => {
      const environment = this.visualizationEnvironmentSignal();
      if (!environment) {
        return [];
      }

      const vehicles = environment.vehicles;
      const counts: Record<string, number> = {};

      for (const vehicle of Object.values(vehicles)) {
        const status = vehicle.status;
        counts[status] = (counts[status] ?? 0) + 1;
      }

      return Object.entries(counts).map(([status, count]) => ({
        status,
        count,
      }));
    });
  }

  get totalNumberOfPassengersSignal(): Signal<number> {
    return computed(() => {
      const counts = this.numberOfPassengersByStatusSignal();
      return counts.reduce((acc, { count }) => acc + count, 0);
    });
  }

  get totalNumberOfVehiclesSignal(): Signal<number> {
    return computed(() => {
      const counts = this.numberOfVehiclesByStatusSignal();
      return counts.reduce((acc, { count }) => acc + count, 0);
    });
  }

  // MARK: Handlers
  hideInformationPanel() {
    this.userInterfaceService.hideInformationPanel();
  }

  showInformationPanel() {
    this.userInterfaceService.showInformationPanel();
  }

  pauseSimulation(id: string) {
    this.simulationService.pauseSimulation(id);
  }

  resumeSimulation(id: string) {
    this.simulationService.resumeSimulation(id);
  }

  async stopSimulation(id: string) {
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

    this.simulationService.stopSimulation(id);
  }

  async leaveVisualization() {
    await this.router.navigate(['home']);
  }
}

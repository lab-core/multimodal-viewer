import { Component, computed, effect, Signal } from '@angular/core';
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
  SimulationStatus,
} from '../../interfaces/simulation.model';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SimulationService } from '../../services/simulation.service';
import { UserInterfaceService } from '../../services/user-interface.service';
import { InformationDialogComponent } from '../information-dialog/information-dialog.component';
import { SimulationControlBarComponent } from '../simulation-control-bar/simulation-control-bar.component';
import { ActivatedRoute } from '@angular/router';


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
  ],
  templateUrl: './visualizer.component.html',
  styleUrl: './visualizer.component.css',
})
export class VisualizerComponent {
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

  constructor(
    private readonly simulationService: SimulationService,
    private readonly userInterfaceService: UserInterfaceService,
    private readonly router: Router,
    private readonly communicationService: CommunicationService,
    private readonly dialogService: DialogService,
    private readonly loadingService: LoadingService,
  ) {
    this.simulationSignal = this.simulationService.activeSimulationSignal;

    // Check if the simulation is available
    effect(() => {
      const status = this.visualizerStatusSignal();

      if (this.matDialogRef) {
        this.matDialogRef.close();
        this.matDialogRef = null;
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
            .then(async () => {
              if (this.matDialogRef) {
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
              if (this.matDialogRef && response) {
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
              if (this.matDialogRef && response) {
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
            .then(async () => {
              if (this.matDialogRef) {
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
            .then(async () => {
              if (this.matDialogRef) {
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
            .then(async () => {
              if (this.matDialogRef) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
      }
    });
  }

  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowInformationPanelSignal;
  }

  get simulationName(): string{
    return this.simulationService.activeSimulationSignal()?.name || 'Untitled Simulation';
  }

  get simulationData(): string{
    return this.simulationService.activeSimulationSignal()?.data || 'Untitled Data Folder';
  }

  hideInformationPanel() {
    this.userInterfaceService.hideInformationPanel();
  }

  showInformationPanel() {
    this.userInterfaceService.showInformationPanel();
  }

  async navigateHome() {
    await this.router.navigate(['home']);
  }
}

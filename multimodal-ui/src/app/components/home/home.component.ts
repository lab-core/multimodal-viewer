import { Component, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-home',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly shouldShowMainMenuSignal: WritableSignal<boolean> = signal(true);

  constructor(
    private readonly dialogService: DialogService,
    private readonly loadingService: LoadingService,
    private readonly communicationService: CommunicationService,
    private readonly router: Router,
  ) {}

  async onStartSimulation() {
    this.shouldShowMainMenuSignal.set(false);

    const result = await firstValueFrom(
      this.dialogService
        .openSimulationConfigurationDialog({
          mode: 'start',
          currentConfiguration: null,
        })
        .afterClosed(),
    );

    if (!result) {
      this.shouldShowMainMenuSignal.set(true);
      return;
    }

    if (!this.communicationService.isConnectedSignal()) {
      await firstValueFrom(
        this.dialogService
          .openInformationDialog({
            title: 'Disconnected',
            message:
              'A connection to the server is needed to create a simulation.',
            type: 'error',
            closeButtonOverride: null,
          })
          .afterClosed(),
      );
      this.shouldShowMainMenuSignal.set(true);
      return;
    }

    this.loadingService.start('Starting simulation');

    // Start the simulation and navigate to the visualization page
    // if the simulation starts in less than 5 seconds.
    // Otherwise, show an error message.
    try {
      await new Promise<void>((resolve, reject) => {
        console.log('Starting simulation');
        const timeout = setTimeout(() => {
          console.log('Timeout');
          reject(new Error('Timeout'));
        }, 5000);

        this.communicationService.on(
          'simulationStart',
          async (name: string) => {
            clearTimeout(timeout);
            console.log('Simulation started');
            this.loadingService.stop();
            await this.router.navigate([`visualize/${name}`]);
            resolve();
          },
        );

        this.communicationService.emit('startSimulation', result.general.name);
      });
    } catch (_error) {
      this.loadingService.stop();

      await firstValueFrom(
        this.dialogService
          .openInformationDialog({
            title: 'Timeout',
            message:
              'The simulation took too long to start. Please verify the status of the server.',
            type: 'error',
            closeButtonOverride: null,
          })
          .afterClosed(),
      );

      this.shouldShowMainMenuSignal.set(true);
      return;
    }

    console.log('Removing listener');
    this.communicationService.removeAllListeners('simulationStart');
  }

  async onBrowseSimulations() {
    this.shouldShowMainMenuSignal.set(false);

    const result = await firstValueFrom(
      this.dialogService.openSimulationListDialog().afterClosed(),
    );

    if (!result || !result.simulationToVisualize) {
      this.shouldShowMainMenuSignal.set(true);
      return;
    }

    await this.router.navigate([
      `visualize/${result.simulationToVisualize.name}`,
    ]);
  }

  onAboutUs() {
    // TODO
  }
}

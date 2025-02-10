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

    // create a unique string to temporarily identify the simulation
    const uniqueId = Math.random().toString(36).substring(7) + Date.now();

    // Start the simulation and navigate to the visualization page
    // if the simulation starts in less than 30 seconds.
    // Otherwise, show an error message.
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 30000);

        this.communicationService.on(uniqueId, async (id: string) => {
          clearTimeout(timeout);
          this.loadingService.stop();
          await this.router.navigate([`visualize/${id}`]);
          resolve();
        });

        this.communicationService.emit(
          'startSimulation',
          result.general.name,
          result.general.data,
          uniqueId,
        );
      });

      this.communicationService.removeAllListeners(uniqueId);
    } catch (_error) {
      this.communicationService.removeAllListeners(uniqueId);

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
      `visualize/${result.simulationToVisualize.id}`,
    ]);
  }

  onAboutUs() {
    // TODO Add about us page
  }
}

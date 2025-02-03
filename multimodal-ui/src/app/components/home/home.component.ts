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

    this.communicationService.on('logEvent', (message) => console.log(message));
    this.communicationService.on('simulationStarted', async (name: string) => {
      this.loadingService.stop();
      await this.router.navigate([`visualize/${name}`]);
      this.shouldShowMainMenuSignal.set(true);
    });

    this.communicationService.emit('startSimulation', result.general.name);
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

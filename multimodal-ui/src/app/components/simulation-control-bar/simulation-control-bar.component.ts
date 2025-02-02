import {
  Component,
  OnDestroy,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogService } from '../../services/dialog.service';
import { UserInterfaceService } from '../../services/user-interface.service';
import { CommunicationService } from '../../services/communication.service';

@Component({
  selector: 'app-simulation-control-bar',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSliderModule,
  ],
  templateUrl: './simulation-control-bar.component.html',
  styleUrl: './simulation-control-bar.component.css',
})
export class SimulationControlBarComponent implements OnInit, OnDestroy {
  readonly currentTimeSignal: WritableSignal<Date> = signal<Date>(new Date());

  private interval: number | null = null;

  readonly isPausedSignal: WritableSignal<boolean> = signal<boolean>(true);

  constructor(private readonly dialogService: DialogService,
    private readonly userInterfaceService: UserInterfaceService,
    private readonly communicationService: CommunicationService,
  ) { }

  togglePause(): void {
    this.isPausedSignal.update((isPaused) => !isPaused);
  }

  ngOnInit(): void {
    this.interval = setInterval(() => {
      if (!this.isPausedSignal()) {
        this.currentTimeSignal.update(
          (previousTime) => new Date(previousTime.getTime() + 1000)
        );
      }
    }, 1000) as unknown as number;
  }

  ngOnDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  sliderLabelFormatter(value: number): string {
    return `${value}%`;
  }

  async editSimulationConfiguration() {
    const result = await this.dialogService.openSimulationConfigurationDialog({
      mode: 'edit',
      currentConfiguration: null,
    });

    if (result) {
      return;
    }

    // TODO
  }

  async stopSimulation() {
    const result = await this.dialogService.openConfirmationDialog({
      title: 'Stopping Simulation',
      message:
        'Are you sure you want to stop the simulation? This action cannot be undone.',
    });

    if (!result) {
      return;
    }
    // TODO Change name test to real name
    this.communicationService.emit('stopSimulation', 'test');
    this.userInterfaceService.navigateToMainMenu();
    // navigateToMainMenu
    // emit stop
  }

  async leaveVisualization() {
    await this.dialogService.openInformationDialog({
      title: 'Leaving Visualization',
      message:
        'You are about to leave the visualization, but the simulation will continue running in the background. You can return to the visualization at any time.',
    });

    // TODO
  }
}

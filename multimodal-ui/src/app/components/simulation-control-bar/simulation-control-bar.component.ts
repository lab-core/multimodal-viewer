import {
  Component,
  input,
  InputSignal,
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
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Simulation } from '../../interfaces/simulation.model';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';

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

  readonly isPausedSignal: WritableSignal<boolean> = signal<boolean>(false);

  readonly simulationInputSignal: InputSignal<Simulation> =
    // eslint-disable-next-line @angular-eslint/no-input-rename
    input.required<Simulation>({ alias: 'simulation' });

  constructor(
    private readonly dialogService: DialogService,
    private readonly communicationService: CommunicationService,
    private readonly router: Router,
  ) {}

  togglePause(): void {
    this.isPausedSignal.update((isPaused) => !isPaused);
    // TODO change to real name
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.isPausedSignal()
      ? this.communicationService.emit('pauseSimulation', 'test')
      : this.communicationService.emit('resumeSimulation', 'test');
  }

  ngOnInit(): void {
    this.interval = setInterval(() => {
      if (!this.isPausedSignal()) {
        this.currentTimeSignal.update(
          (previousTime) => new Date(previousTime.getTime() + 1000),
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
    const result = await firstValueFrom(
      this.dialogService
        .openSimulationConfigurationDialog({
          mode: 'edit',
          currentConfiguration: null,
        })
        .afterClosed(),
    );

    if (result) {
      return;
    }

    // TODO
  }

  async stopSimulation(simulation: Simulation) {
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

    this.communicationService.emit(
      'stopSimulation',
      // TODO Change this to id
      simulation.name,
    );
  }

  async leaveVisualization() {
    await firstValueFrom(
      this.dialogService
        .openInformationDialog({
          title: 'Leaving Visualization',
          message:
            'You are about to leave the visualization, but the simulation will continue running in the background. You can return to the visualization at any time.',
          type: 'warning',
          closeButtonOverride: 'Continue',
        })
        .afterClosed(),
    );

    await this.router.navigate(['home']);
  }
}

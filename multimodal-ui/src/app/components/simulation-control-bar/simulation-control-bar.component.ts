import {
  Component,
  computed,
  input,
  InputSignal,
  OnDestroy,
  OnInit,
  Signal,
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
import { DialogService } from '../../services/dialog.service';
import { SimulationService } from '../../services/simulation.service';

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

  readonly simulationInputSignal: InputSignal<Simulation> =
    // eslint-disable-next-line @angular-eslint/no-input-rename
    input.required<Simulation>({ alias: 'simulation' });

  readonly isPausedSignal: Signal<boolean> = computed(
    () => this.simulationInputSignal().status === 'paused',
  );

  constructor(
    private readonly dialogService: DialogService,
    private readonly simulationService: SimulationService,
    private readonly router: Router,
  ) {}

  togglePause(wasPaused: boolean, id: string): void {
    if (wasPaused) {
      this.simulationService.resumeSimulation(id);
    } else {
      this.simulationService.pauseSimulation(id);
    }
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

    // TODO Update simulation configuration
  }

  async stopSimulation(simulation: Simulation) {
    const result = await firstValueFrom(
      this.dialogService
        .openInformationDialog({
          title: 'Stopping Simulation',
          message:
            'Are you sure you want to stop the simulation? This action cannot be undone.',
          type: null,
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

  async leaveVisualization() {
    await this.router.navigate(['home']);
  }
}

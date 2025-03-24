import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  input,
  InputSignal,
  OnDestroy,
  OnInit,
  output,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import hotkeys from 'hotkeys-js';
import {
  Simulation,
  SimulationStates,
} from '../../interfaces/simulation.model';
import { SimulationTimePipe } from '../../pipes/simulation-time.pipe';
import { AnimationService } from '../../services/animation.service';
import { SimulationService } from '../../services/simulation.service';
import { VisualizationService } from '../../services/visualization.service';

@Component({
  selector: 'app-simulation-control-bar',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSliderModule,
    SimulationTimePipe,
    DecimalPipe,
  ],
  templateUrl: './simulation-control-bar.component.html',
  styleUrl: './simulation-control-bar.component.css',
})
export class SimulationControlBarComponent implements OnInit, OnDestroy {
  // MARK: Properties
  readonly isSimulationPausedSignal: Signal<boolean> = computed(
    () => this.simulationInputSignal().status === 'paused',
  );
  readonly MIN_SPEED_POWER = 0;
  readonly MAX_SPEED_POWER = 5;

  private readonly speedPowerSignal: WritableSignal<number> = signal(0);

  private readonly speedDirectionSignal: WritableSignal<number> = signal(1);

  readonly canIncreaseSpeedSignal: Signal<boolean> = computed(
    () => this.speedPowerSignal() < this.MAX_SPEED_POWER,
  );

  readonly canDecreaseSpeedSignal: Signal<boolean> = computed(
    () => this.speedPowerSignal() > this.MIN_SPEED_POWER,
  );

  readonly speedSignal: Signal<number> = computed(
    () => Math.pow(2, this.speedPowerSignal()) * this.speedDirectionSignal(),
  );

  // MARK: Inputs
  readonly simulationInputSignal: InputSignal<Simulation> =
    input.required<Simulation>({ alias: 'simulation' });

  // MARK: Outputs
  readonly leaveVisualizationOutput = output<void>({
    alias: 'leaveVisualization',
  });

  private readonly sliderUpdateSignal: WritableSignal<number> = signal(0);
  private readonly SLIDER_UPDATE_INTERVAL = 1000 / 5; // 5 times per second
  private interval: NodeJS.Timeout | null = null;

  private wantedVisualizationTime: number | null = null;
  private hasBeenAltered = false;
  private readonly SMALL_OFFSET = 0.0001;
  readonly wantedVisualizationTimeSignal: Signal<number | null> = computed(
    () => {
      // This allows the slider to update even when the visualization time does not change.
      // This is necessary because the slider is not updated when it has an invalid value.
      this.sliderUpdateSignal();
      const newWantedVisualizationTime =
        this.visualizationService.wantedVisualizationTimeSignal();

      if (newWantedVisualizationTime === null) {
        return null;
      }

      if (newWantedVisualizationTime !== this.wantedVisualizationTime) {
        this.wantedVisualizationTime = newWantedVisualizationTime;
        return newWantedVisualizationTime;
      }

      if (this.hasBeenAltered) {
        this.hasBeenAltered = false;
        return newWantedVisualizationTime;
      }

      this.hasBeenAltered = true;

      return newWantedVisualizationTime + this.SMALL_OFFSET;
    },
  );

  // MARK: Constructor
  constructor(
    private readonly visualizationService: VisualizationService,
    private readonly animationService: AnimationService,
    private readonly simulationService: SimulationService,
  ) {
    effect(() => {
      const speed = this.speedSignal();
      this.visualizationService.setVisualizationSpeed(speed);
      this.animationService.setSpeed(speed);
    });

    hotkeys('space', () => {
      this.toggleVisualizationPause(this.isVisualizationPausedSignal());
    });

    hotkeys('ctrl+left,command+left,cmd+left', () => {
      // TODO fast backward
    });

    hotkeys('ctrl+right,command+right,cmd+right ', () => {
      // TODO fast forward
    });

    hotkeys('ctrl+up,command+up,cmd+up', () => {
      this.increaseSpeed();
    });

    hotkeys('ctrl+down,command+down,cmd+down', () => {
      this.decreaseSpeed();
    });

    hotkeys('r', () => {
      this.toggleSimulationDirection();
    });

    hotkeys('c', () => {
      this.centerMap();
    });

    hotkeys('f', () => {
      this.toggleShouldFollowEntity();
    });
  }

  ngOnInit() {
    this.interval = setInterval(() => {
      this.sliderUpdateSignal.update((value) => value + 1);
    }, this.SLIDER_UPDATE_INTERVAL);
  }

  ngOnDestroy() {
    if (this.interval !== null) {
      clearInterval(this.interval);
    }
  }

  // MARK: Getters
  get isInitializedSignal(): Signal<boolean> {
    return this.visualizationService.isInitializedSignal;
  }

  get simulationStartTimeSignal(): Signal<number | null> {
    return this.visualizationService.simulationStartTimeSignal;
  }

  get simulationEndTimeSignal(): Signal<number | null> {
    return this.visualizationService.simulationEndTimeSignal;
  }

  get visualizationMaxTimeSignal(): Signal<number | null> {
    return this.visualizationService.visualizationMaxTimeSignal;
  }

  get isVisualizationPausedSignal(): Signal<boolean> {
    return this.visualizationService.isVisualizationPausedSignal;
  }

  get simulationStatesSignal(): Signal<SimulationStates> {
    return this.simulationService.simulationStatesSignal;
  }

  get shouldFollowEntitySignal(): Signal<boolean> {
    return this.animationService.shouldFollowEntitySignal;
  }

  // MARK: Handlers
  toggleVisualizationPause(wasPaused: boolean): void {
    if (wasPaused) {
      this.visualizationService.resumeVisualization();
    } else {
      this.visualizationService.pauseVisualization();
    }
  }

  decreaseSpeed(): void {
    this.speedPowerSignal.update((power) =>
      Math.max(power - 1, this.MIN_SPEED_POWER),
    );
  }

  increaseSpeed(): void {
    this.speedPowerSignal.update((power) =>
      Math.min(power + 1, this.MAX_SPEED_POWER),
    );
  }

  toggleSimulationDirection(): void {
    this.speedDirectionSignal.update((direction) => -direction);
  }

  centerMap() {
    this.animationService.centerMap();
  }

  toggleShouldFollowEntity() {
    this.animationService.toggleShouldFollowEntity();
  }

  leaveVisualization(): void {
    this.leaveVisualizationOutput.emit();
  }

  onSliderChange(value: number) {
    this.visualizationService.setVisualizationTime(value);
  }

  // MARK: Other
  sliderLabelFormatter(min: number, max: number): (value: number) => string {
    return (value: number) => {
      return Math.floor((100 * (value - min)) / (max - min)) + '%';
    };
  }
}

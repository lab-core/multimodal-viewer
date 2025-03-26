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
  viewChild,
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import {
  AbstractControl,
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { MatInput, MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-simulation-control-bar',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSliderModule,
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatMenuModule,
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
  readonly MAX_SPEED_POWER = 7;
  readonly FAST_FORWARD_STEP = 5;

  private readonly speedPowerSignal: WritableSignal<number> = signal(0);

  private readonly speedDirectionSignal: WritableSignal<number> = signal(1);

  readonly speedSignal: Signal<number> = computed(
    () => Math.pow(2, this.speedPowerSignal()) * this.speedDirectionSignal(),
  );

  readonly fastForwardStepSignal: Signal<number> = computed(() => {
    return Math.abs(this.speedSignal()) * this.FAST_FORWARD_STEP;
  });

  // MARK: Inputs
  readonly simulationInputSignal: InputSignal<Simulation> =
    input.required<Simulation>({ alias: 'simulation' });

  // MARK: Outputs
  readonly leaveVisualizationOutput = output<void>({
    alias: 'leaveVisualization',
  });

  showVisualisationTimeEditorSignal = signal(false);
  readonly editorVisualisationTimeForm = new FormControl(
    '',
    this.validateVisualisationTimeInput(),
  );
  readonly editorvisualisationTimeInput = viewChild(MatInput);
  readonly editorVisualisationTimeValueSignal: WritableSignal<number> =
    signal(NaN);

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

    this.editorVisualisationTimeForm.valueChanges.subscribe((value) => {
      this.editorVisualisationTimeValueSignal.set(
        value ? parseInt(value) : NaN,
      );
    });

    hotkeys('space', () => {
      this.toggleVisualizationPause(this.isVisualizationPausedSignal());
    });

    hotkeys('ctrl+left,command+left,cmd+left', () => {
      this.rewindTime();
    });

    hotkeys('ctrl+right,command+right,cmd+right ', () => {
      this.fastForwardTime();
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

  setSpeed(speed: number): void {
    this.speedPowerSignal.set(speed);
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

  fastForwardTime() {
    this.translateTime(this.fastForwardStepSignal());
  }

  rewindTime() {
    this.translateTime(-this.fastForwardStepSignal());
  }

  translateTime(value: number) {
    const currentTime =
      this.visualizationService.wantedVisualizationTimeSignal();
    if (!currentTime) return;
    this.visualizationService.setVisualizationTime(currentTime + value);
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

  /**** Visualisation Time Editor ****/

  openVisualisationTimeEditor() {
    const visualisationTimeInput = this.editorvisualisationTimeInput();
    if (visualisationTimeInput === undefined) return;

    this.editorVisualisationTimeForm.setValue(
      this.wantedVisualizationTimeSignal()?.toFixed(0) ?? null,
    );

    this.showVisualisationTimeEditorSignal.set(true);
    visualisationTimeInput.focus();
  }

  applyVisualisationTime() {
    const visualisationTimeValue = this.editorVisualisationTimeValueSignal();
    if (visualisationTimeValue === null || isNaN(visualisationTimeValue))
      return;

    this.visualizationService.setVisualizationTime(visualisationTimeValue);
    this.showVisualisationTimeEditorSignal.set(false);
  }

  hideVisualisationTimeEditor() {
    this.showVisualisationTimeEditorSignal.set(false);
  }

  /**** ************************ ****/

  onSliderChange(value: number) {
    this.visualizationService.setVisualizationTime(value);
  }

  // MARK: Other
  sliderLabelFormatter(min: number, max: number): (value: number) => string {
    return (value: number) => {
      return Math.floor((100 * (value - min)) / (max - min)) + '%';
    };
  }

  private validateVisualisationTimeInput(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const number = parseInt(control.value as string);
      if (isNaN(number) || number <= 0) return { invalidNumber: true };
      else return null;
    };
  }
}

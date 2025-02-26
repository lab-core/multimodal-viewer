import { Component, Inject, OnDestroy, Signal } from '@angular/core';
import { HttpService } from '../../services/http.service';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Subject, takeUntil } from 'rxjs';
import { SimulationConfiguration } from '../../interfaces/simulation.model';
import { DataService } from '../../services/data.service';

export interface SimulationConfigurationDialogData {
  mode: 'start' | 'edit';
  currentConfiguration: SimulationConfiguration | null;
}

export interface SimulationConfigurationDialogResult {
  general: {
    name: string;
    data: string;
    shouldRunInBackground: boolean;
  };
  configuration: SimulationConfiguration;
}

@Component({
  selector: 'app-simulation-configuration-dialog',
  imports: [
    MatDialogActions,
    MatDialogClose,
    MatDialogTitle,
    MatDialogContent,
    MatButtonModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatCheckboxModule,
    MatInputModule,
    MatIconModule,
  ],
  templateUrl: './simulation-configuration-dialog.component.html',
  styleUrl: './simulation-configuration-dialog.component.css',
})
export class SimulationConfigurationDialogComponent implements OnDestroy {
  readonly formGroup: FormGroup;
  readonly generalFormGroup: FormGroup;
  readonly configurationFormGroup: FormGroup;

  readonly nameFormControl: FormControl<string | null>;
  readonly dataFormControl: FormControl<string | null>;
  readonly maxTimeFormControl: FormControl<number | null>;
  readonly speedFormControl: FormControl<number | null>;
  readonly timeStepFormControl: FormControl<number | null>;
  readonly positionTimeStepFormControl: FormControl<number | null>;
  readonly shouldRunInBackgroundFormControl: FormControl<boolean | null>;

  private readonly unsubscribe$ = new Subject<void>();

  constructor(
    @Inject(MAT_DIALOG_DATA)
    public readonly data: SimulationConfigurationDialogData,
    public readonly dataService: DataService,
    private readonly dialogRef: MatDialogRef<
      SimulationConfigurationDialogComponent,
      SimulationConfigurationDialogResult
    >,
    private readonly formBuilder: FormBuilder,
    private httpService: HttpService,
  ) {
    // TODO Validators
    // Initialize form
    this.nameFormControl = this.formBuilder.control(null, [
      // eslint-disable-next-line @typescript-eslint/unbound-method
      Validators.required,
    ]);
    this.dataFormControl = this.formBuilder.control(null, [
      // eslint-disable-next-line @typescript-eslint/unbound-method
      Validators.required,
    ]);
    this.shouldRunInBackgroundFormControl = this.formBuilder.control(false);

    this.maxTimeFormControl = this.formBuilder.control(null);
    this.speedFormControl = this.formBuilder.control(null);
    this.timeStepFormControl = this.formBuilder.control(null);
    this.positionTimeStepFormControl = this.formBuilder.control(null);

    this.generalFormGroup = this.formBuilder.group({
      name: this.nameFormControl,
      data: this.dataFormControl,
      shouldRunInBackground: this.shouldRunInBackgroundFormControl,
    });

    this.configurationFormGroup = this.formBuilder.group({
      maxTime: this.maxTimeFormControl,
      speed: this.speedFormControl,
      timeStep: this.timeStepFormControl,
      positionTimeStep: this.positionTimeStepFormControl,
    });

    this.formGroup = this.formBuilder.group({
      general: this.generalFormGroup,
      configuration: this.configurationFormGroup,
    });

    // Prefill form
    if (this.data.mode === 'edit' && this.data.currentConfiguration) {
      this.maxTimeFormControl.setValue(this.data.currentConfiguration.maxTime);
      this.speedFormControl.setValue(this.data.currentConfiguration.speed);
      this.timeStepFormControl.setValue(
        this.data.currentConfiguration.timeStep,
      );
      this.positionTimeStepFormControl.setValue(
        this.data.currentConfiguration.positionTimeStep,
      );
    }

    // Disable fields if data is not provided
    if (this.data.mode === 'start') {
      this.dataFormControl.valueChanges
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe((value) => {
          if (value) {
            // TODO Prefill?
            this.enableConfigurationFields();
          } else {
            this.disableConfigurationFields();
          }
        });

      if (!this.dataFormControl.value) {
        this.disableConfigurationFields();
      }
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  onSave() {
    if (this.formGroup.valid) {
      this.dialogRef.close(this.buildResult());
    } else {
      console.error('Invalid form', this.formGroup);
    }
  }

  get availableSimulationDataSignal(): Signal<string[]> {
    return this.dataService.availableSimulationDataSignal;
  }

  private buildResult(): SimulationConfigurationDialogResult {
    return {
      general: {
        name: this.nameFormControl.value as string,
        data: this.dataFormControl.value as string,
        shouldRunInBackground: !!this.shouldRunInBackgroundFormControl.value,
      },
      configuration: {
        maxTime: this.maxTimeFormControl.value,
        speed: this.speedFormControl.value,
        timeStep: this.timeStepFormControl.value,
        positionTimeStep: this.positionTimeStepFormControl.value,
      },
    };
  }

  private disableConfigurationFields() {
    this.maxTimeFormControl.disable();
    this.speedFormControl.disable();
    this.timeStepFormControl.disable();
    this.positionTimeStepFormControl.disable();
  }

  private enableConfigurationFields() {
    this.maxTimeFormControl.enable();
    this.speedFormControl.enable();
    this.timeStepFormControl.enable();
    this.positionTimeStepFormControl.enable();
  }

  refreshAvailableData() {
    this.dataService.queryAvailableData();
  }

  // TODO Implement or remove
  importNewFolder() {
    this.httpService.getData().subscribe((data: any) => {
      console.log(data.message);
    });
  }
}

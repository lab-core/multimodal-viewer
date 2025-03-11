import { Component, Inject, OnDestroy, Signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
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
import {
  SIMULATION_SAVE_FILE_SEPARATOR,
  SimulationConfiguration,
} from '../../interfaces/simulation.model';
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
  ) {
    // Initialize form
    this.nameFormControl = this.formBuilder.control(null, [
      Validators.minLength(3),
      Validators.maxLength(50),
      this.validateName(),
    ]);
    if (this.data.mode === 'start') {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.nameFormControl.addValidators(Validators.required);
    }

    this.dataFormControl = this.formBuilder.control(null);
    if (this.data.mode === 'start') {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.dataFormControl.addValidators(Validators.required);
    }

    this.shouldRunInBackgroundFormControl = this.formBuilder.control(false);

    this.maxTimeFormControl = this.formBuilder.control(null, [
      Validators.min(0),
    ]);

    this.generalFormGroup = this.formBuilder.group({
      name: this.nameFormControl,
      data: this.dataFormControl,
      shouldRunInBackground: this.shouldRunInBackgroundFormControl,
    });

    this.configurationFormGroup = this.formBuilder.group({
      maxTime: this.maxTimeFormControl,
    });

    this.formGroup = this.formBuilder.group({
      general: this.generalFormGroup,
      configuration: this.configurationFormGroup,
    });

    // Prefill form
    if (this.data.mode === 'edit' && this.data.currentConfiguration) {
      this.maxTimeFormControl.setValue(this.data.currentConfiguration.maxTime);
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

  refreshAvailableData() {
    this.dataService.queryAvailableData();
  }

  private buildResult(): SimulationConfigurationDialogResult {
    let name = this.nameFormControl.value as string;
    if (typeof name === 'string') {
      name = name.trim().replace(/\s/g, '_');
    }

    return {
      general: {
        name,
        data: this.dataFormControl.value as string,
        shouldRunInBackground: !!this.shouldRunInBackgroundFormControl.value,
      },
      configuration: {
        maxTime: this.maxTimeFormControl.value,
      },
    };
  }

  private disableConfigurationFields() {
    this.maxTimeFormControl.disable();
  }

  private enableConfigurationFields() {
    this.maxTimeFormControl.enable();
  }

  private validateName(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (
        typeof control.value === 'string') {
          // Forbid the use of the simulation save file separator
          if (

        control.value.match(SIMULATION_SAVE_FILE_SEPARATOR)
      ) {
        return { invalidPattern: true };

      }
      // Forbid the use of characters that might cause issues with the file system
      else if (
        control.value.match(/[<>:"/\\|?*]/)
      ) {
        return { invalidCharacter: true };
      }}
      return null;
    };
  }
}

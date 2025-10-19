import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, inject, Injector, OnInit } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
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
import {
  MatAutocomplete,
  MatAutocompleteModule,
} from '@angular/material/autocomplete';
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
import JSZip from 'jszip';
import {
  combineLatest,
  filter,
  firstValueFrom,
  map,
  startWith,
  take,
  timeout,
} from 'rxjs';
import { SIMULATION_SAVE_FILE_SEPARATOR } from '../../../environments/environment';
import { SimulationConfiguration } from '../../interfaces/simulation.model';
import { DataService } from '../../services/data.service';
import { DialogService } from '../../services/dialog.service';
import {
  HttpService,
  ImportFolderContent,
  ImportFolderResponse,
} from '../../services/http.service';
import { LoadingService } from '../../services/loading.service';
import { SnackBarService } from '../../services/snack-bar.service';

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
    MatAutocompleteModule,
    MatCheckboxModule,
    MatInputModule,
    MatIconModule,
    MatAutocomplete,
    AsyncPipe,
  ],
  templateUrl: './simulation-configuration-dialog.component.html',
  styleUrl: './simulation-configuration-dialog.component.css',
})
export class SimulationConfigurationDialogComponent implements OnInit {
  readonly data = inject<SimulationConfigurationDialogData>(MAT_DIALOG_DATA);
  readonly dataService = inject(DataService);
  private readonly dialogRef =
    inject<
      MatDialogRef<
        SimulationConfigurationDialogComponent,
        SimulationConfigurationDialogResult
      >
    >(MatDialogRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly httpService = inject(HttpService);
  private readonly loadingService = inject(LoadingService);
  private readonly snackBarService = inject(SnackBarService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogService = inject(DialogService);

  readonly SIMULATION_SAVE_FILE_SEPARATOR = SIMULATION_SAVE_FILE_SEPARATOR;

  readonly nameFormControl: FormControl<string | null> =
    this.formBuilder.control(null, [
      Validators.minLength(3),
      Validators.maxLength(50),
      this.validateName(),
    ]);
  readonly dataFormControl: FormControl<string | null> =
    this.formBuilder.control(null);
  readonly maxDurationFormControl: FormControl<number | null> =
    this.formBuilder.control(null, [Validators.min(0)]);
  readonly shouldRunInBackgroundFormControl: FormControl<boolean | null> =
    this.formBuilder.control(false);

  readonly generalFormGroup: FormGroup = this.formBuilder.group({
    name: this.nameFormControl,
    data: this.dataFormControl,
    shouldRunInBackground: this.shouldRunInBackgroundFormControl,
  });
  readonly configurationFormGroup: FormGroup = this.formBuilder.group({
    maxDuration: this.maxDurationFormControl,
  });

  readonly formGroup: FormGroup = this.formBuilder.group({
    general: this.generalFormGroup,
    configuration: this.configurationFormGroup,
  });

  readonly filteredData$ = combineLatest([
    this.dataFormControl.valueChanges.pipe(startWith('')),
    toObservable(this.dataService.availableSimulationDataSignal),
  ]).pipe(
    map(([value, data]) =>
      value
        ? data.filter((name) =>
            name.toLowerCase().includes(value.toLowerCase()),
          )
        : data,
    ),
  );

  ngOnInit() {
    // Initialize form
    if (this.data.mode === 'start') {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.dataFormControl.addValidators(Validators.required);
      this.dataFormControl.addValidators(
        (control: AbstractControl): ValidationErrors | null =>
          this.dataService
            .availableSimulationDataSignal()
            .includes(control.value as string)
            ? null
            : { doesNotExist: true },
      );
    }

    // Prefill form
    if (this.data.mode === 'edit' && this.data.currentConfiguration) {
      this.maxDurationFormControl.setValue(
        this.data.currentConfiguration.maxDuration === null
          ? null
          : this.data.currentConfiguration.maxDuration / 3600,
      );
    }

    // Disable fields if data is not provided
    if (this.data.mode === 'start') {
      this.dataFormControl.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((value) => {
          if (value) {
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

  onSave() {
    this.formGroup.markAllAsTouched();

    if (this.formGroup.valid) {
      this.dialogRef.close(this.buildResult());
    } else {
      console.error('Invalid form', this.formGroup);
    }
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
        maxDuration:
          this.maxDurationFormControl.value === null
            ? null
            : Math.ceil(this.maxDurationFormControl.value * 3600),
      },
    };
  }

  private disableConfigurationFields() {
    this.maxDurationFormControl.disable();
  }

  private enableConfigurationFields() {
    this.maxDurationFormControl.enable();
  }

  private validateName(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (typeof control.value === 'string') {
        // Forbid the use of the simulation save file separator
        if (control.value.match(SIMULATION_SAVE_FILE_SEPARATOR)) {
          return { invalidPattern: true };
        }
        // Forbid the use of characters that might cause issues with the file system
        else if (control.value.match(/[<>:"/\\|?*]/)) {
          return { invalidCharacter: true };
        }
      }
      return null;
    };
  }

  async onInstanceFolderImport(event: Event) {
    await this.importInstanceOrInstances(
      event,
      'Importing instance folder...',
      'instance',
      async (response: ImportFolderResponse) => {
        await this.waitForInstanceToAppear(response.folderName);

        this.dataFormControl.setValue(response.folderName);
      },
    );
  }

  async onInstancesFolderImport(event: Event) {
    await this.importInstanceOrInstances(
      event,
      'Importing instances folder...',
      'instances',
      () => {
        this.dataService.queryAvailableData();
      },
    );
  }

  async onDeleteInstance(event: Event, instanceName: string) {
    event.stopPropagation();

    const shouldContinue = await firstValueFrom(
      this.dialogService
        .openInformationDialog({
          title: 'Deleting Instance ' + instanceName,
          message:
            'Are you sure you want to delete this instance? This action cannot be undone.',
          type: 'warning',
          confirmButtonOverride: null,
          cancelButtonOverride: null,
          canCancel: true,
        })
        .afterClosed(),
    );

    if (!shouldContinue) {
      return;
    }

    try {
      this.loadingService.start('Deleting instance folder...');

      await firstValueFrom(
        this.httpService.deleteFolder('instance', instanceName),
      );

      await this.waitForInstanceToDisappear(instanceName);

      this.snackBarService.showMessage('Deletion successful', 'success');
    } catch (error) {
      console.error('HTTP error during deletion:', error);
      this.snackBarService.showMessage('Deletion failed', 'error');
    } finally {
      this.loadingService.stop();
    }
  }

  private async importInstanceOrInstances(
    event: Event,
    loadingLabel: string,
    importFolderContent: ImportFolderContent,
    afterImport: (response: ImportFolderResponse) => Promise<void> | void,
  ) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) {
      return;
    }

    try {
      this.loadingService.start(loadingLabel);

      const zip = new JSZip();
      const baseFolder = files[0].webkitRelativePath.split('/')[0];

      for (const file of Array.from(files)) {
        const relativePath = file.webkitRelativePath.replace(
          baseFolder + '/',
          '',
        );
        zip.file(relativePath, file);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const formData = new FormData();
      formData.append('file', blob, 'folder.zip');

      const response = await firstValueFrom(
        this.httpService.importFolder(
          importFolderContent,
          baseFolder,
          formData,
        ),
      );

      const maybePromise = afterImport(response);

      if (maybePromise instanceof Promise) {
        await maybePromise;
      }

      this.snackBarService.showMessage('Import successful', 'success');
    } catch (error) {
      console.error('Import failed:', error);
      this.snackBarService.showMessage('Import failed', 'error');
    } finally {
      const target = event.target as HTMLInputElement;
      target.value = '';
      this.loadingService.stop();
    }
  }
  private async waitForInstanceToAppear(instanceName: string) {
    return new Promise((resolve, reject) => {
      toObservable(this.dataService.availableSimulationDataSignal, {
        injector: this.injector,
      })
        .pipe(
          filter((data) => data.some((dataName) => dataName === instanceName)),
          timeout({ first: 3000 }),
          take(1),
        )
        .subscribe({
          next: (data) => resolve(data),
          error: () => reject(new Error('Timeout waiting for available data')),
        });

      this.dataService.queryAvailableData();
    });
  }

  private async waitForInstanceToDisappear(instanceName: string) {
    return new Promise((resolve, reject) => {
      toObservable(this.dataService.availableSimulationDataSignal, {
        injector: this.injector,
      })
        .pipe(
          filter((data) => data.every((dataName) => dataName !== instanceName)),
          timeout({ first: 3000 }),
          take(1),
        )
        .subscribe({
          next: (data) => resolve(data),
          error: () => reject(new Error('Timeout waiting for available data')),
        });

      this.dataService.queryAvailableData();
    });
  }
}

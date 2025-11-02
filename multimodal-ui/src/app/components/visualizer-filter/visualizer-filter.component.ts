import { Component, DestroyRef, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { debounceTime } from 'rxjs';
import { VisualizationFilterService } from '../../services/visualization-filter.service';

@Component({
  selector: 'app-visualizer-filter',
  imports: [
    MatCardModule,
    MatCheckboxModule,
    MatRadioModule,
    MatChipsModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    ReactiveFormsModule,
  ],
  templateUrl: './visualizer-filter.component.html',
  styleUrl: './visualizer-filter.component.css',
})
export class VisualizerFilterComponent {
  private readonly visualizationFilterService = inject(
    VisualizationFilterService,
  );

  private readonly formBuilder = inject(FormBuilder);

  private readonly destroyRef = inject(DestroyRef);

  readonly queryErrorSignal = this.visualizationFilterService.error;

  private readonly queryValidator: ValidatorFn = (control: AbstractControl) => {
    const error = this.queryErrorSignal();
    return error ? { error } : null;
  };

  readonly filtersQueryFormControl = this.formBuilder.control<string>(
    '',
    this.queryValidator,
  );

  constructor() {
    this.filtersQueryFormControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef), debounceTime(500))
      .subscribe((query) =>
        this.visualizationFilterService.setFilterQuery(query),
      );

    effect(() => {
      this.queryErrorSignal();
      this.filtersQueryFormControl.updateValueAndValidity({ emitEvent: false });
    });
  }
}

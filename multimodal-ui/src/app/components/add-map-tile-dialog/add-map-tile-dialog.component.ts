import { Component, inject } from '@angular/core';
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

export type AddMapTileDialogData = null;

export interface AddMapTileDialogResult {
  name: string;
  url: string;
  attribution: string | null;
}

@Component({
  selector: 'app-add-map-layer-dialog',
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
  templateUrl: './add-map-tile-dialog.component.html',
  styleUrl: './add-map-tile-dialog.component.css',
})
export class AddMapTileDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<AddMapTileDialogComponent, AddMapTileDialogResult>>(
      MatDialogRef,
    );
  private readonly formBuilder = inject(FormBuilder);

  readonly nameFormControl: FormControl<string | null> =
    this.formBuilder.control(null, [
      Validators.minLength(3),
      Validators.maxLength(30),
      // eslint-disable-next-line @typescript-eslint/unbound-method
      Validators.required,
    ]);

  readonly urlFormControl: FormControl<string | null> =
    this.formBuilder.control(null, [
      // eslint-disable-next-line @typescript-eslint/unbound-method
      Validators.required,
    ]);

  readonly attributionFormControl: FormControl<string | null> =
    this.formBuilder.control(null);

  readonly formGroup: FormGroup = this.formBuilder.group({
    name: this.nameFormControl,
    url: this.urlFormControl,
    attribution: this.attributionFormControl,
  });

  onAdd() {
    if (this.formGroup.valid) {
      const result: AddMapTileDialogResult = {
        name: this.nameFormControl.value as string,
        url: this.urlFormControl.value as string,
        attribution: this.attributionFormControl.value,
      };
      this.dialogRef.close(result);
    }
  }
}

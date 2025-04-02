import {
  Component,
  ElementRef,
  signal,
  Signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomSprite } from '../../interfaces/entity.model';
import { SpritesService } from '../../services/sprites.service';
import { read } from 'fs';
import { MatDividerModule } from '@angular/material/divider';

export type EditMapIconsDialogData = null;

export interface EditMapIconsDialogResult {
  name: string;
  url: string;
  attribution: string | null;
}

@Component({
  selector: 'app-edit-map-icons-dialog',
  imports: [
    MatDialogActions,
    MatDialogClose,
    MatDialogTitle,
    MatDialogContent,
    MatButtonModule,
    FormsModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatCheckboxModule,
    MatInputModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './edit-map-icons-dialog.component.html',
  styleUrl: './edit-map-icons-dialog.component.css',
})
export class EditMapIconsDialogComponent {
  private selectedSpriteIndex = 0;

  customSprites: WritableSignal<CustomSprite[]> = signal([]);

  uploadButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('fileUpload');

  constructor(
    private readonly dialogRef: MatDialogRef<
      EditMapIconsDialogComponent,
      EditMapIconsDialogResult
    >,
    private readonly spritesService: SpritesService,
  ) {}

  uploadSprite(index: number) {
    this.selectedSpriteIndex = index;
    this.uploadButton().nativeElement.click();
  }

  onFileSelected(event: Event) {
    console.log(`index: ${this.selectedSpriteIndex}`);
    console.log(event);

    const input = event.target as HTMLInputElement;
    if (!input || !input.files) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      console.log(reader.result);
      if (!reader.result) return;
      console.log('setting it');
      this.setSprite(this.selectedSpriteIndex, reader.result);
    };
    reader.readAsDataURL(input.files[0]);
  }

  addSprite() {
    this.customSprites.update((customSprites) => {
      return [...customSprites, { mode: '', url: '/images/sample-bus.png' }];
    });
  }

  removeSprite(index: number) {
    if (index >= this.customSprites().length) return;
    this.customSprites.update((customSprites) => {
      customSprites.splice(index, 1);
      return [...customSprites];
    });
  }

  setSprite(index: number, url: string | ArrayBuffer) {
    if (index >= this.customSprites().length) return;
    this.customSprites.update((customSprites) => {
      customSprites[index].url = url;
      return [...customSprites];
    });
  }

  onSave() {}
}

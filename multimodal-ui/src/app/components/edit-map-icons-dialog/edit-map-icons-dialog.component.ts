import {
  Component,
  ElementRef,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
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
import { SpriteSaveData, SpritesService } from '../../services/sprites.service';
import { MatDividerModule } from '@angular/material/divider';
import { Jimp } from 'jimp';

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
  readonly SPRITE_SIZE;

  currentError = '';

  customSprites: WritableSignal<CustomSprite[]> = signal([]);

  defaultVehicleSprite: WritableSignal<string> = signal('');

  defaultPassengerSprite: WritableSignal<string> = signal('');

  uploadButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('fileUpload');

  private selectedSpriteIndex = 0;
  private selectedDefaultSprite: 'vehicle' | 'passenger' = 'vehicle';

  constructor(
    private readonly dialogRef: MatDialogRef<
      EditMapIconsDialogComponent,
      EditMapIconsDialogResult
    >,
    private readonly spritesService: SpritesService,
  ) {
    this.SPRITE_SIZE = this.spritesService.SPRITE_SIZE;
    this.defaultVehicleSprite.set(this.spritesService.defaultVehicleSprite);
    this.defaultPassengerSprite.set(this.spritesService.defaultPassengerSprite);
    this.customSprites.set(this.spritesService.customSprites);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input || !input.files) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      if (!reader.result) return;

      try {
        const image = await Jimp.read(reader.result);
        image.resize({ w: this.SPRITE_SIZE });
        const base64url = await image.getBase64('image/png');
        if (this.selectedSpriteIndex !== -1) {
          this.setCustomSprite(this.selectedSpriteIndex, base64url);
        } else {
          if (this.selectedDefaultSprite === 'vehicle')
            this.defaultVehicleSprite.set(base64url);
          else if (this.selectedDefaultSprite === 'passenger')
            this.defaultPassengerSprite.set(base64url);
        }

        this.currentError = '';
      } catch {
        this.currentError = 'Cannot upload this image.';
      }
    };

    reader.readAsDataURL(input.files[0]);
  }

  onFileImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input || !input.files) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (!reader.result) return;

      try {
        const spriteSaveData = JSON.parse(
          reader.result as string,
        ) as SpriteSaveData;

        if (!spriteSaveData.defaultVehicleSprite) {
          this.currentError = 'JSON has missing data: defaultVehicleSprite';
          return;
        }

        if (!spriteSaveData.defaultPassengerSprite) {
          this.currentError = 'JSON has missing data: defaultPassengerSprite';
          return;
        }

        if (!spriteSaveData.customSprites) {
          this.currentError = 'JSON has missing data: customSprites';
          return;
        }

        this.defaultVehicleSprite.set(spriteSaveData.defaultVehicleSprite);
        this.defaultPassengerSprite.set(spriteSaveData.defaultPassengerSprite);
        this.customSprites.set(spriteSaveData.customSprites);

        this.currentError = '';
      } catch {
        this.currentError = 'Could not parse JSON data.';
      }
    };

    reader.readAsText(input.files[0]);
  }

  uploadDefaultSprite(type: 'vehicle' | 'passenger') {
    this.selectedSpriteIndex = -1;
    this.selectedDefaultSprite = type;
    this.uploadButton().nativeElement.click();
  }

  resetDefaultSprite(type: 'vehicle' | 'passenger') {
    if (type === 'vehicle')
      this.defaultVehicleSprite.set('/images/sample-bus.png');
    else if (type === 'passenger')
      this.defaultPassengerSprite.set('/images/sample-walk.png');
  }

  uploadCustomSprite(index: number) {
    this.selectedSpriteIndex = index;
    this.uploadButton().nativeElement.click();
  }

  addCustomSprite() {
    this.customSprites.update((customSprites) => {
      return [...customSprites, { mode: '', url: '/images/sample-bus.png' }];
    });
  }

  removeCustomSprite(index: number) {
    if (index >= this.customSprites().length) return;
    this.customSprites.update((customSprites) => {
      customSprites.splice(index, 1);
      return [...customSprites];
    });
  }

  setCustomSprite(index: number, url: string) {
    if (index >= this.customSprites().length) return;
    this.customSprites.update((customSprites) => {
      customSprites[index].url = url;
      return [...customSprites];
    });
  }

  exportSprites() {
    const saveData: SpriteSaveData = {
      defaultVehicleSprite: this.defaultVehicleSprite(),
      defaultPassengerSprite: this.defaultPassengerSprite(),
      customSprites: this.customSprites(),
    };

    const blob = new Blob([JSON.stringify(saveData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multimodal-icons.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onSave() {
    this.spritesService.saveSpriteData(
      this.defaultVehicleSprite(),
      this.defaultPassengerSprite(),
      this.customSprites(),
    );
    this.dialogRef.close();
  }
}

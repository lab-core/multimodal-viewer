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
import { MatSliderModule } from '@angular/material/slider';
import { ImageResource } from 'pixi.js';

export type EditMapIconsDialogData = null;

type EditableDefaultIconTypes =
  | 'vehicle'
  | 'passenger'
  | 'zoom-out-vehicle'
  | 'zoom-out-passenger';

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
    MatSliderModule,
  ],
  templateUrl: './edit-map-icons-dialog.component.html',
  styleUrl: './edit-map-icons-dialog.component.css',
})
export class EditMapIconsDialogComponent {
  readonly SPRITE_SIZE;

  currentError = '';

  customSprites: WritableSignal<CustomSprite[]> = signal([]);

  defaultVehicleSprite: WritableSignal<string> = signal('');
  zoomOutVehicleSprite: WritableSignal<string> = signal('');

  defaultPassengerSprite: WritableSignal<string> = signal('');
  zoomOutPassengerSprite: WritableSignal<string> = signal('');

  uploadButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('fileUpload');

  private selectedSpriteIndex = 0;
  private selectedDefaultSprite: EditableDefaultIconTypes = 'vehicle';

  constructor(
    private readonly dialogRef: MatDialogRef<
      EditMapIconsDialogComponent,
      EditMapIconsDialogResult
    >,
    private readonly spritesService: SpritesService,
  ) {
    this.SPRITE_SIZE = this.spritesService.SPRITE_SIZE;

    // Safe to assume its an ImageResource with a url because they are all loaded from a url.

    this.defaultVehicleSprite.set(
      (this.spritesService.vehicleSprite.baseTexture.resource as ImageResource)
        .url,
    );

    this.zoomOutVehicleSprite.set(
      (
        this.spritesService.zoomOutVehicleSprite.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.defaultPassengerSprite.set(
      (
        this.spritesService.passengerSprite.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.zoomOutPassengerSprite.set(
      (
        this.spritesService.zoomOutPassengerSprite.baseTexture
          .resource as ImageResource
      ).url,
    );

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
          this.getDefaultSpriteSignal(this.selectedDefaultSprite).set(
            base64url,
          );
        }

        this.currentError = '';
      } catch {
        this.currentError = 'Cannot upload this image.';
      } finally {
        input.value = ''; // Clear
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

        if (!spriteSaveData.vehicleSprite) {
          this.currentError = 'JSON has missing data: defaultVehicleSprite';
          return;
        }

        if (!spriteSaveData.passengerSprite) {
          this.currentError = 'JSON has missing data: defaultPassengerSprite';
          return;
        }

        if (!spriteSaveData.customSprites) {
          this.currentError = 'JSON has missing data: customSprites';
          return;
        }

        this.defaultVehicleSprite.set(spriteSaveData.vehicleSprite);
        this.defaultPassengerSprite.set(spriteSaveData.passengerSprite);
        this.zoomOutVehicleSprite.set(spriteSaveData.zoomOutVehicleSprite);
        this.zoomOutPassengerSprite.set(spriteSaveData.zoomOutPassengerSprite);
        this.customSprites.set(spriteSaveData.customSprites);

        this.currentError = '';
      } catch {
        this.currentError = 'Could not parse JSON data.';
      } finally {
        input.value = ''; // Clear
      }
    };

    reader.readAsText(input.files[0]);
  }

  uploadDefaultSprite(type: EditableDefaultIconTypes) {
    this.selectedSpriteIndex = -1;
    this.selectedDefaultSprite = type;
    this.uploadButton().nativeElement.click();
  }

  getDefaultSpriteSignal(type: EditableDefaultIconTypes) {
    switch (type) {
      case 'vehicle':
        return this.defaultVehicleSprite;
      case 'passenger':
        return this.defaultPassengerSprite;
      case 'zoom-out-vehicle':
        return this.zoomOutVehicleSprite;
      case 'zoom-out-passenger':
        return this.zoomOutPassengerSprite;
    }
  }

  resetDefaultSprite(type: EditableDefaultIconTypes) {
    switch (type) {
      case 'vehicle':
        this.defaultVehicleSprite.set(
          this.spritesService.DEFAULT_VEHICLE_SPRITE,
        );
        break;
      case 'passenger':
        this.defaultPassengerSprite.set(
          this.spritesService.DEFAULT_PASSENGER_SPRITE,
        );
        break;
      case 'zoom-out-vehicle':
        this.zoomOutVehicleSprite.set(
          this.spritesService.DEFAULT_ZOOM_OUT_VEHICLE_SPRITE,
        );
        break;
      case 'zoom-out-passenger':
        this.zoomOutPassengerSprite.set(
          this.spritesService.DEFAULT_ZOOM_OUT_PASSENGER_SPRITE,
        );
        break;
    }
  }

  uploadCustomSprite(index: number) {
    this.selectedSpriteIndex = index;
    this.uploadButton().nativeElement.click();
  }

  addCustomSprite() {
    this.customSprites.update((customSprites) => {
      return [
        ...customSprites,
        { mode: '', url: this.spritesService.DEFAULT_VEHICLE_SPRITE },
      ];
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
      version: this.spritesService.VERSION,
      vehicleSprite: this.defaultVehicleSprite(),
      passengerSprite: this.defaultPassengerSprite(),
      zoomOutVehicleSprite: this.zoomOutVehicleSprite(),
      zoomOutPassengerSprite: this.zoomOutPassengerSprite(),
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
      this.zoomOutVehicleSprite(),
      this.zoomOutPassengerSprite(),
      this.customSprites(),
    );
    this.dialogRef.close();
  }
}

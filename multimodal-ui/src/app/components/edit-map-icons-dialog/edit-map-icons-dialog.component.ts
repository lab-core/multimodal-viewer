import {
  Component,
  computed,
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
import {
  TextureSaveData,
  SpritesService,
  CustomTexture,
} from '../../services/sprites.service';
import { MatDividerModule } from '@angular/material/divider';
import { Jimp } from 'jimp';
import { MatSliderModule } from '@angular/material/slider';
import { ImageResource } from 'pixi.js';
import {
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDrag,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { color as d3Color } from 'd3-color';
import { interpolateRgbBasis as d3InterpolateRgb } from 'd3-interpolate';

export type EditMapIconsDialogData = null;

type EditableDefaultIconTypes =
  | 'vehicle'
  | 'passenger'
  | 'zoom-out-vehicle'
  | 'zoom-out-passenger'
  | 'stop';

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
    MatRadioModule,
    CdkDragPlaceholder,
    CdkDropList,
    CdkDrag,
  ],
  templateUrl: './edit-map-icons-dialog.component.html',
  styleUrl: './edit-map-icons-dialog.component.css',
})
export class EditMapIconsDialogComponent {
  readonly SPRITE_SIZE;

  private readonly MIN_COLOR_COUNT = 2;
  private readonly MAX_COLOR_COUNT = 8;

  readonly PRESET_LIGHT_COLOR_THEME = [
    '#ccffcc',
    '#ffffb3',
    '#ffffb3',
    '#ffb980',
    '#ffb980',
    '#ff3333',
    '#ff3333',
  ];

  readonly PRESET_SATURATED_COLOR_THEME = [
    '#00ff00',
    '#ffff00',
    '#ff8000',
    '#ff0000',
  ];

  currentError = '';

  colorSetIndex = 0;
  customColors = signal(['#00ff00', '#ff0000']);

  testScaleValue = 0;
  testScaleColor = '#ffffff';

  vehicleModeTextures: WritableSignal<CustomTexture[]> = signal([]);

  vehicleTextureUrl: WritableSignal<string> = signal('');
  zoomOutVehicleTextureUrl: WritableSignal<string> = signal('');

  passengerTextureUrl: WritableSignal<string> = signal('');
  zoomOutPassengerTextureUrl: WritableSignal<string> = signal('');

  stopTextureUrl: WritableSignal<string> = signal('');

  uploadButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('fileUpload');

  private selectedTextureIndex = 0;
  private selectedDefaultTextureType: EditableDefaultIconTypes = 'vehicle';

  constructor(
    private readonly dialogRef: MatDialogRef<
      EditMapIconsDialogComponent,
      EditMapIconsDialogResult
    >,
    private readonly spritesService: SpritesService,
  ) {
    this.SPRITE_SIZE = this.spritesService.SPRITE_SIZE;

    // Safe to assume it's an ImageResource with a url because they are all loaded from a url.

    this.vehicleTextureUrl.set(
      (this.spritesService.vehicleTexture.baseTexture.resource as ImageResource)
        .url,
    );

    this.zoomOutVehicleTextureUrl.set(
      (
        this.spritesService.zoomOutVehicleTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.passengerTextureUrl.set(
      (
        this.spritesService.passengerTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.zoomOutPassengerTextureUrl.set(
      (
        this.spritesService.zoomOutPassengerTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.stopTextureUrl.set(
      (this.spritesService.stopTexture.baseTexture.resource as ImageResource)
        .url,
    );

    this.vehicleModeTextures.set(this.spritesService.vehicleModeTextures);
  }

  dropCustomColor(event: CdkDragDrop<string[]>) {
    this.customColors.update((customColors) => {
      moveItemInArray(customColors, event.previousIndex, event.currentIndex);
      return customColors;
    });
  }

  canRemoveColor = computed(
    () => this.customColors().length > this.MIN_COLOR_COUNT,
  );

  canAddColor = computed(
    () => this.customColors().length < this.MAX_COLOR_COUNT,
  );

  addCustomColor() {
    if (this.canAddColor())
      this.customColors.update((customColors) => {
        return [...customColors, '#dd0000'];
      });
  }

  removeCustomColor() {
    if (this.canRemoveColor())
      this.customColors.update((customColors) => {
        customColors.pop();
        return [...customColors];
      });
  }

  onColorChange(index: number, event: Event) {
    const color = (event.target as HTMLInputElement).value;
    this.customColors.update((customColors) => {
      customColors[index] = color;
      return customColors;
    });

    this.aplyColorScale();
  }

  onColorSetIndexChange(event: MatRadioChange) {
    this.aplyColorScale();
  }

  onColorScaleChange(event: Event) {
    this.testScaleValue =
      parseInt((event.target as HTMLInputElement).value) / 100;
    this.aplyColorScale();
  }

  aplyColorScale() {
    let colorSet: string[] = [];
    if (this.colorSetIndex == 0) colorSet = this.PRESET_LIGHT_COLOR_THEME;
    if (this.colorSetIndex == 1) colorSet = this.PRESET_SATURATED_COLOR_THEME;
    if (this.colorSetIndex == 2) colorSet = this.customColors();

    if (this.testScaleValue === 0) {
      this.testScaleColor = '#ffffff';
      return;
    }

    const interpolate = d3InterpolateRgb(colorSet);
    const color =
      d3Color(interpolate(this.testScaleValue))?.formatHex() ?? '#ffffff';
    this.testScaleColor = color;
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
        if (this.selectedTextureIndex !== -1) {
          this.setVehicleModeTexture(this.selectedTextureIndex, base64url);
        } else {
          this.getTextureUrlSignal(this.selectedDefaultTextureType).set(
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
        ) as TextureSaveData;

        if (
          !spriteSaveData.version ||
          spriteSaveData.version !== this.spritesService.VERSION
        ) {
          this.currentError = 'Import data format is outdated.';
          return;
        }

        if (!spriteSaveData.vehicleTextureUrl) {
          this.currentError = 'JSON has missing data: vehicleTextureUrl';
          return;
        }

        if (!spriteSaveData.passengerTextureUrl) {
          this.currentError = 'JSON has missing data: passengerTextureUrl';
          return;
        }

        if (!spriteSaveData.vehicleModeTextures) {
          this.currentError = 'JSON has missing data: vehicleModeTextures';
          return;
        }

        if (!spriteSaveData.stopTextureUrl) {
          this.currentError = 'JSON has missing data: stopTextureUrl';
          return;
        }

        this.vehicleTextureUrl.set(spriteSaveData.vehicleTextureUrl);
        this.passengerTextureUrl.set(spriteSaveData.passengerTextureUrl);
        this.zoomOutVehicleTextureUrl.set(
          spriteSaveData.zoomOutVehicleTextureUrl,
        );
        this.zoomOutPassengerTextureUrl.set(
          spriteSaveData.zoomOutPassengerTextureUrl,
        );
        this.stopTextureUrl.set(spriteSaveData.stopTextureUrl);
        this.vehicleModeTextures.set(spriteSaveData.vehicleModeTextures);

        this.currentError = '';
      } catch {
        this.currentError = 'Could not parse JSON data.';
      } finally {
        input.value = ''; // Clear
      }
    };

    reader.readAsText(input.files[0]);
  }

  uploadDefaultTexture(type: EditableDefaultIconTypes) {
    this.selectedTextureIndex = -1;
    this.selectedDefaultTextureType = type;
    this.uploadButton().nativeElement.click();
  }

  getTextureUrlSignal(type: EditableDefaultIconTypes) {
    switch (type) {
      case 'vehicle':
        return this.vehicleTextureUrl;
      case 'passenger':
        return this.passengerTextureUrl;
      case 'zoom-out-vehicle':
        return this.zoomOutVehicleTextureUrl;
      case 'zoom-out-passenger':
        return this.zoomOutPassengerTextureUrl;
      case 'stop':
        return this.stopTextureUrl;
    }
  }

  resetDefaultTexture(type: EditableDefaultIconTypes) {
    switch (type) {
      case 'vehicle':
        this.vehicleTextureUrl.set(
          this.spritesService.DEFAULT_VEHICLE_TEXTURE_URL,
        );
        break;
      case 'passenger':
        this.passengerTextureUrl.set(
          this.spritesService.DEFAULT_PASSENGER_TEXTURE_URL,
        );
        break;
      case 'zoom-out-vehicle':
        this.zoomOutVehicleTextureUrl.set(
          this.spritesService.DEFAULT_ZOOM_OUT_VEHICLE_TEXTURE_URL,
        );
        break;
      case 'zoom-out-passenger':
        this.zoomOutPassengerTextureUrl.set(
          this.spritesService.DEFAULT_ZOOM_OUT_PASSENGER_TEXTURE_URL,
        );
        break;
      case 'stop':
        this.stopTextureUrl.set(this.spritesService.DEFAULT_STOP_TEXTURE_URL);
    }
  }

  uploadVehicleModeTexture(index: number) {
    this.selectedTextureIndex = index;
    this.uploadButton().nativeElement.click();
  }

  addVehicleModeTexture() {
    this.vehicleModeTextures.update((vehicleModeTexture) => {
      return [
        ...vehicleModeTexture,
        { mode: '', url: this.spritesService.DEFAULT_VEHICLE_TEXTURE_URL },
      ];
    });
  }

  removeVehicleModeTexture(index: number) {
    if (index >= this.vehicleModeTextures().length) return;
    this.vehicleModeTextures.update((vehicleModeTexture) => {
      vehicleModeTexture.splice(index, 1);
      return [...vehicleModeTexture];
    });
  }

  setVehicleModeTexture(index: number, url: string) {
    if (index >= this.vehicleModeTextures().length) return;
    this.vehicleModeTextures.update((vehicleModeTexture) => {
      vehicleModeTexture[index].url = url;
      return [...vehicleModeTexture];
    });
  }

  exportTextures() {
    const saveData: TextureSaveData = {
      version: this.spritesService.VERSION,
      vehicleTextureUrl: this.vehicleTextureUrl(),
      passengerTextureUrl: this.passengerTextureUrl(),
      zoomOutVehicleTextureUrl: this.zoomOutVehicleTextureUrl(),
      zoomOutPassengerTextureUrl: this.zoomOutPassengerTextureUrl(),
      stopTextureUrl: this.stopTextureUrl(),
      vehicleModeTextures: this.vehicleModeTextures(),
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
    this.spritesService.saveTextureData(
      this.vehicleTextureUrl(),
      this.passengerTextureUrl(),
      this.zoomOutVehicleTextureUrl(),
      this.zoomOutPassengerTextureUrl(),
      this.stopTextureUrl(),
      this.vehicleModeTextures(),
    );
    this.dialogRef.close();
  }
}

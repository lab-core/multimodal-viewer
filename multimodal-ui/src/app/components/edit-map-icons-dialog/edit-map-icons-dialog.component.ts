import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { TitleCasePipe } from '@angular/common';
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
  MatChipEditedEvent,
  MatChipInputEvent,
  MatChipsModule,
} from '@angular/material/chips';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { color as d3Color } from 'd3-color';
import { interpolateRgbBasis as d3InterpolateRgb } from 'd3-interpolate';
import { Jimp } from 'jimp';
import { ImageResource } from 'pixi.js';
import {
  BackgroundShape,
  BackgroundShapeType,
  CUSTOMIZATION_ENTITY_TYPES,
  CUSTOMIZATION_ZOOMS,
  CustomTexture,
  SpritesService,
  TextureSaveData,
} from '../../services/sprites.service';
import { BackgroundShapeComponent } from '../background-shape/background-shape.component';

export type EditMapIconsDialogData = null;

type EditableDefaultIconType =
  | 'vehicle'
  | 'stop-with-passenger'
  | 'empty-stop'
  | 'zoomed-out-vehicle'
  | 'zoomed-out-stop-with-passenger'
  | 'zoomed-out-empty-stop';

const EDITABLE_DEFAULT_ICON_TYPES: EditableDefaultIconType[] = [
  'vehicle',
  'stop-with-passenger',
  'empty-stop',
  'zoomed-out-vehicle',
  'zoomed-out-stop-with-passenger',
  'zoomed-out-empty-stop',
];

export type EditMapIconsDialogResult = null;

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
    TitleCasePipe,
    MatChipsModule,
    BackgroundShapeComponent,
  ],
  templateUrl: './edit-map-icons-dialog.component.html',
  styleUrl: './edit-map-icons-dialog.component.css',
})
export class EditMapIconsDialogComponent {
  readonly SPRITE_SIZE;
  readonly PRESET_LIGHT_COLOR_THEME;
  readonly PRESET_SATURATED_COLOR_THEME;
  readonly EDITABLE_DEFAULT_ICON_TYPES = EDITABLE_DEFAULT_ICON_TYPES;
  readonly CUSTOMIZATION_ENTITY_TYPES = CUSTOMIZATION_ENTITY_TYPES;
  readonly CUSTOMIZATION_ZOOMS = CUSTOMIZATION_ZOOMS;

  private readonly MIN_COLOR_COUNT = 2;
  private readonly MAX_COLOR_COUNT = 12;

  currentError = '';

  colorPresetIndex = 0;
  customColors = signal(['#00ff00', '#ff0000']);

  testScaleValue = 0;
  testScaleColor = '#ffffff';

  customTexturesSignal: WritableSignal<CustomTexture[]> = signal([]);
  backgroundShapesSignal: WritableSignal<BackgroundShape[]> = signal([]);

  vehicleTextureUrl: WritableSignal<string> = signal('');
  stopWithPassengerTextureUrl: WritableSignal<string> = signal('');
  emptyStopTextureUrl: WritableSignal<string> = signal('');

  zoomedOutVehicleTextureUrl: WritableSignal<string> = signal('');
  zoomedOutStopWithPassengerTextureUrl: WritableSignal<string> = signal('');
  zoomedOutEmptyStopTextureUrl: WritableSignal<string> = signal('');

  uploadButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('iconFileUpload');

  private selectedTextureIndex: number | null = null;
  private selectedDefaultTextureType: EditableDefaultIconType | null = null;

  constructor(
    private readonly dialogRef: MatDialogRef<
      EditMapIconsDialogComponent,
      EditMapIconsDialogResult
    >,
    private readonly spritesService: SpritesService,
  ) {
    this.SPRITE_SIZE = this.spritesService.SPRITE_SIZE;
    this.PRESET_LIGHT_COLOR_THEME =
      this.spritesService.PRESET_LIGHT_COLOR_THEME;
    this.PRESET_SATURATED_COLOR_THEME =
      this.spritesService.PRESET_SATURATED_COLOR_THEME;

    // Safe to assume it's an ImageResource with a url because they are all loaded from a url.
    this.vehicleTextureUrl.set(
      (this.spritesService.vehicleTexture.baseTexture.resource as ImageResource)
        .url,
    );

    this.stopWithPassengerTextureUrl.set(
      (
        this.spritesService.stopWithPassengerTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.emptyStopTextureUrl.set(
      (
        this.spritesService.emptyStopTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.zoomedOutVehicleTextureUrl.set(
      (
        this.spritesService.zoomedOutVehicleTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.zoomedOutStopWithPassengerTextureUrl.set(
      (
        this.spritesService.zoomedOutStopWithPassengerTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.zoomedOutEmptyStopTextureUrl.set(
      (
        this.spritesService.zoomedOutEmptyStopTexture.baseTexture
          .resource as ImageResource
      ).url,
    );

    this.customTexturesSignal.set(this.spritesService.customTextures);

    this.backgroundShapesSignal.set(this.spritesService.backgroundShapes);

    this.colorPresetIndex = this.spritesService.colorPresetIndex;
    this.customColors.set(structuredClone(this.spritesService.customColors));
  }

  dropCustomColor(event: CdkDragDrop<string[]>) {
    this.customColors.update((customColors) => {
      moveItemInArray(customColors, event.previousIndex, event.currentIndex);
      return customColors;
    });
    this.applyColorGradientTester();
  }

  canRemoveColor = computed(
    () => this.customColors().length > this.MIN_COLOR_COUNT,
  );

  canAddColor = computed(
    () => this.customColors().length < this.MAX_COLOR_COUNT,
  );

  addCustomColor() {
    if (this.canAddColor()) {
      this.customColors.update((customColors) => {
        return [...customColors, '#dd0000'];
      });

      this.applyColorGradientTester();
    }
  }

  removeCustomColor() {
    if (this.canRemoveColor()) {
      this.customColors.update((customColors) => {
        customColors.pop();
        return [...customColors];
      });

      this.applyColorGradientTester();
    }
  }

  onColorChange(index: number, event: Event) {
    const color = (event.target as HTMLInputElement).value;
    this.customColors.update((customColors) => {
      customColors[index] = color;
      return customColors;
    });

    this.applyColorGradientTester();
  }

  onColorSetIndexChange(event: MatRadioChange) {
    this.applyColorGradientTester();
  }

  onColorScaleChange(event: Event) {
    this.testScaleValue =
      parseInt((event.target as HTMLInputElement).value) / 100;
    this.applyColorGradientTester();
  }

  applyColorGradientTester() {
    let colorSet: string[] = [];
    if (this.colorPresetIndex == 0)
      colorSet = this.spritesService.PRESET_LIGHT_COLOR_THEME;
    if (this.colorPresetIndex == 1)
      colorSet = this.spritesService.PRESET_SATURATED_COLOR_THEME;
    if (this.colorPresetIndex == 2) colorSet = this.customColors();

    if (this.testScaleValue === 0) {
      this.testScaleColor = '#ffffff';
      return;
    }

    const interpolate = d3InterpolateRgb(colorSet);
    const color =
      d3Color(interpolate(this.testScaleValue))?.formatHex() ?? '#ffffff';
    this.testScaleColor = color;
  }

  onIconFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input || !input.files) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      if (!reader.result) return;

      try {
        const image = await Jimp.read(reader.result);
        image.resize({ w: this.SPRITE_SIZE });
        const base64url = await image.getBase64('image/png');
        if (this.selectedTextureIndex !== null) {
          this.setCustomTexture(this.selectedTextureIndex, base64url);
        } else if (this.selectedDefaultTextureType !== null) {
          this.getTextureUrlSignal(this.selectedDefaultTextureType).set(
            base64url,
          );
        } else {
          this.currentError = 'No texture selected for upload.';
          return;
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

  onConfigurationFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input || !input.files) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (!reader.result) return;

      try {
        const spriteSaveData = JSON.parse(
          reader.result as string,
        ) as TextureSaveData;

        if (spriteSaveData.version !== this.spritesService.VERSION) {
          this.currentError = 'Import data format is outdated.';
          return;
        }

        if (spriteSaveData.vehicleTextureUrl === undefined) {
          this.currentError = 'JSON has missing data: vehicleTextureUrl';
          return;
        }

        if (spriteSaveData.stopWithPassengerTextureUrl === undefined) {
          this.currentError =
            'JSON has missing data: stopWithPassengerTextureUrl';
          return;
        }

        if (spriteSaveData.emptyStopTextureUrl === undefined) {
          this.currentError = 'JSON has missing data: emptyStopTextureUrl';
          return;
        }

        if (spriteSaveData.zoomedOutVehicleTextureUrl === undefined) {
          this.currentError =
            'JSON has missing data: zoomedOutVehicleTextureUrl';
          return;
        }

        if (spriteSaveData.zoomedOutStopWithPassengerTextureUrl === undefined) {
          this.currentError =
            'JSON has missing data: zoomedOutStopWithPassengerTextureUrl';
          return;
        }

        if (spriteSaveData.zoomedOutEmptyStopTextureUrl === undefined) {
          this.currentError =
            'JSON has missing data: zoomedOutEmptyStopTextureUrl';
          return;
        }

        if (spriteSaveData.customTextures === undefined) {
          this.currentError = 'JSON has missing data: customTextures';
          return;
        }

        if (spriteSaveData.colorPresetIndex === undefined) {
          this.currentError = 'JSON has missing data: colorPresetIndex';
          return;
        }

        if (spriteSaveData.customColors === undefined) {
          this.currentError = 'JSON has missing data: customColors';
          return;
        }

        this.vehicleTextureUrl.set(spriteSaveData.vehicleTextureUrl);
        this.stopWithPassengerTextureUrl.set(
          spriteSaveData.stopWithPassengerTextureUrl,
        );
        this.emptyStopTextureUrl.set(spriteSaveData.emptyStopTextureUrl);

        this.zoomedOutVehicleTextureUrl.set(
          spriteSaveData.zoomedOutVehicleTextureUrl,
        );
        this.zoomedOutStopWithPassengerTextureUrl.set(
          spriteSaveData.zoomedOutStopWithPassengerTextureUrl,
        );
        this.zoomedOutEmptyStopTextureUrl.set(
          spriteSaveData.zoomedOutEmptyStopTextureUrl,
        );

        this.customTexturesSignal.set(spriteSaveData.customTextures);

        this.backgroundShapesSignal.set(spriteSaveData.backgroundShapes);

        this.colorPresetIndex = spriteSaveData.colorPresetIndex;

        if (spriteSaveData.customColors.length >= 2)
          this.customColors.set(spriteSaveData.customColors);

        this.currentError = '';
      } catch {
        this.currentError = 'Could not parse JSON data.';
      } finally {
        input.value = ''; // Clear
      }
    };

    reader.readAsText(input.files[0]);
  }

  uploadDefaultTexture(type: EditableDefaultIconType) {
    this.selectedTextureIndex = null;
    this.selectedDefaultTextureType = type;
    this.uploadButton().nativeElement.click();
  }

  getTextureUrlSignal(type: EditableDefaultIconType) {
    switch (type) {
      case 'vehicle':
        return this.vehicleTextureUrl;
      case 'stop-with-passenger':
        return this.stopWithPassengerTextureUrl;
      case 'empty-stop':
        return this.emptyStopTextureUrl;
      case 'zoomed-out-vehicle':
        return this.zoomedOutVehicleTextureUrl;
      case 'zoomed-out-stop-with-passenger':
        return this.zoomedOutStopWithPassengerTextureUrl;
      case 'zoomed-out-empty-stop':
        return this.zoomedOutEmptyStopTextureUrl;
    }
  }

  resetDefaultTexture(type: EditableDefaultIconType) {
    switch (type) {
      case 'vehicle':
        this.vehicleTextureUrl.set(
          this.spritesService.DEFAULT_VEHICLE_TEXTURE_URL,
        );
        break;
      case 'stop-with-passenger':
        this.stopWithPassengerTextureUrl.set(
          this.spritesService.DEFAULT_STOP_WITH_PASSENGER_TEXTURE_URL,
        );
        break;

      case 'empty-stop':
        this.emptyStopTextureUrl.set(
          this.spritesService.DEFAULT_EMPTY_STOP_TEXTURE_URL,
        );
        break;
      case 'zoomed-out-vehicle':
        this.zoomedOutVehicleTextureUrl.set(
          this.spritesService.DEFAULT_ZOOMED_OUT_VEHICLE_TEXTURE_URL,
        );
        break;

      case 'zoomed-out-stop-with-passenger':
        this.zoomedOutStopWithPassengerTextureUrl.set(
          this.spritesService
            .DEFAULT_ZOOMED_OUT_STOP_WITH_PASSENGER_TEXTURE_URL,
        );
        break;
      case 'zoomed-out-empty-stop':
        this.zoomedOutEmptyStopTextureUrl.set(
          this.spritesService.DEFAULT_ZOOMED_OUT_EMPTY_STOP_TEXTURE_URL,
        );
    }
  }

  uploadCustomTexture(index: number) {
    this.selectedTextureIndex = index;
    this.selectedDefaultTextureType = null;
    this.uploadButton().nativeElement.click();
  }

  addCustomTexture() {
    this.customTexturesSignal.update((customTexture) => {
      return [
        ...customTexture,
        {
          mode: null,
          url: this.spritesService.DEFAULT_UNDEFINED_TEXTURE_URL,
          tags: [],
          type: 'vehicle',
          zoom: 'any',
        },
      ];
    });
  }

  removeCustomTexture(index: number) {
    if (index >= this.customTexturesSignal().length) return;
    this.customTexturesSignal.update((customTextures) => {
      customTextures.splice(index, 1);
      return [...customTextures];
    });
  }

  setCustomTexture(index: number, url: string) {
    if (index >= this.customTexturesSignal().length) return;
    this.customTexturesSignal.update((customTextures) => {
      customTextures[index].url = url;
      return [...customTextures];
    });
  }

  dropCustomTexture(event: CdkDragDrop<CustomTexture[]>) {
    this.customTexturesSignal.update((customTextures) => {
      moveItemInArray(customTextures, event.previousIndex, event.currentIndex);
      return structuredClone(customTextures);
    });
  }

  addTagToCustomTexture(index: number, event: MatChipInputEvent) {
    if (index >= this.customTexturesSignal().length) return;
    this.customTexturesSignal.update((customTextures) => {
      const texture = structuredClone(customTextures[index]);
      const tag = event.value.trim();
      if (!tag) return customTextures; // No tag to add
      if (!texture.tags.includes(tag)) {
        texture.tags.push(tag);
        texture.tags.sort();
      }
      event.chipInput.clear();
      customTextures[index] = texture;
      return [...customTextures];
    });
  }

  removeTagFromCustomTexture(index: number, tag: string) {
    if (index >= this.customTexturesSignal().length) return;
    this.customTexturesSignal.update((customTextures) => {
      const texture = structuredClone(customTextures[index]);
      texture.tags = texture.tags.filter((t) => t !== tag);
      customTextures[index] = texture;
      return [...customTextures];
    });
  }

  editTagInCustomTexture(
    index: number,
    oldTag: string,
    event: MatChipEditedEvent,
  ) {
    if (index >= this.customTexturesSignal().length) return;
    this.customTexturesSignal.update((customTextures) => {
      const texture = structuredClone(customTextures[index]);
      const newTag = event.value.trim();
      if (oldTag) {
        texture.tags = texture.tags.filter((t) => t !== oldTag);
      }
      if (newTag && !texture.tags.includes(newTag)) {
        texture.tags.push(newTag);
        texture.tags.sort();
      }
      customTextures[index] = texture;
      return [...customTextures];
    });
  }

  addBackgroundShape() {
    this.backgroundShapesSignal.update((backgroundShapes) => {
      return [
        ...backgroundShapes,
        {
          color: '#ff000080', // Default color with half opacity
          shape: 'circle',
          mode: null,
          tags: [],
          type: 'vehicle',
          zoom: 'any',
        },
      ];
    });
  }

  removeBackgroundShape(index: number) {
    if (index >= this.backgroundShapesSignal().length) return;
    this.backgroundShapesSignal.update((backgroundShapes) => {
      backgroundShapes.splice(index, 1);
      return [...backgroundShapes];
    });
  }

  dropBackgroundShape(event: CdkDragDrop<BackgroundShape[]>) {
    this.backgroundShapesSignal.update((backgroundShapes) => {
      moveItemInArray(
        backgroundShapes,
        event.previousIndex,
        event.currentIndex,
      );
      return structuredClone(backgroundShapes);
    });
  }

  addTagToBackgroundShape(index: number, event: MatChipInputEvent) {
    if (index >= this.backgroundShapesSignal().length) return;
    this.backgroundShapesSignal.update((backgroundShapes) => {
      const backgroundShape = structuredClone(backgroundShapes[index]);
      const tag = event.value.trim();
      if (!tag) return backgroundShapes; // No tag to add
      if (!backgroundShape.tags.includes(tag)) {
        backgroundShape.tags.push(tag);
        backgroundShape.tags.sort();
      }
      event.chipInput.clear();
      backgroundShapes[index] = backgroundShape;
      return [...backgroundShapes];
    });
  }

  removeTagFromBackgroundShape(index: number, tag: string) {
    if (index >= this.backgroundShapesSignal().length) return;
    this.backgroundShapesSignal.update((backgroundShapes) => {
      const backgroundShape = structuredClone(backgroundShapes[index]);
      backgroundShape.tags = backgroundShape.tags.filter((t) => t !== tag);
      backgroundShapes[index] = backgroundShape;
      return [...backgroundShapes];
    });
  }

  editTagInBackgroundShape(
    index: number,
    oldTag: string,
    event: MatChipEditedEvent,
  ) {
    if (index >= this.backgroundShapesSignal().length) return;
    this.backgroundShapesSignal.update((backgroundShapes) => {
      const backgroundShape = structuredClone(backgroundShapes[index]);
      const newTag = event.value.trim();
      if (oldTag) {
        backgroundShape.tags = backgroundShape.tags.filter((t) => t !== oldTag);
      }
      if (newTag && !backgroundShape.tags.includes(newTag)) {
        backgroundShape.tags.push(newTag);
        backgroundShape.tags.sort();
      }
      backgroundShapes[index] = backgroundShape;
      return [...backgroundShapes];
    });
  }

  onBackgroundShapeTypeChange(index: number, shape: BackgroundShapeType) {
    if (index >= this.backgroundShapesSignal().length) return;
    this.backgroundShapesSignal.update((backgroundShapes) => {
      const backgroundShape = structuredClone(backgroundShapes[index]);
      backgroundShape.shape = shape;
      backgroundShapes[index] = backgroundShape;
      return [...backgroundShapes];
    });
  }

  onBackgroundShapeColorChange(index: number, event: Event) {
    if (index >= this.backgroundShapesSignal().length) return;
    const color = (event.target as HTMLInputElement).value;
    this.backgroundShapesSignal.update((backgroundShapes) => {
      const backgroundShape = structuredClone(backgroundShapes[index]);
      backgroundShape.color = color + '80'; // Ensure half opacity
      backgroundShapes[index] = backgroundShape;
      return [...backgroundShapes];
    });
  }

  exportTextures() {
    const saveData: TextureSaveData = {
      version: this.spritesService.VERSION,
      vehicleTextureUrl: this.vehicleTextureUrl(),
      stopWithPassengerTextureUrl: this.stopWithPassengerTextureUrl(),
      emptyStopTextureUrl: this.emptyStopTextureUrl(),
      zoomedOutVehicleTextureUrl: this.zoomedOutVehicleTextureUrl(),
      zoomedOutStopWithPassengerTextureUrl:
        this.zoomedOutStopWithPassengerTextureUrl(),
      zoomedOutEmptyStopTextureUrl: this.zoomedOutEmptyStopTextureUrl(),
      customTextures: this.customTexturesSignal(),
      backgroundShapes: this.backgroundShapesSignal(),
      colorPresetIndex: this.colorPresetIndex,
      customColors: this.customColors(),
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
      this.stopWithPassengerTextureUrl(),
      this.emptyStopTextureUrl(),
      this.zoomedOutVehicleTextureUrl(),
      this.zoomedOutStopWithPassengerTextureUrl(),
      this.zoomedOutEmptyStopTextureUrl(),
      this.customTexturesSignal(),
      this.backgroundShapesSignal(),
      this.colorPresetIndex,
      this.customColors(),
    );
    this.dialogRef.close();
  }
}

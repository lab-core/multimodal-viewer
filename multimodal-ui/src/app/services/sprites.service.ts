import { Injectable } from '@angular/core';
import { ColorSource } from '@pixi/color';
import { Texture } from '@pixi/core';
import { Graphics } from '@pixi/graphics';
import * as L from 'leaflet';

// MARK: Models
export type CustomizationEntityType =
  | 'vehicle'
  | 'empty-stop'
  | 'stop-with-passenger'
  | 'all';

export const CUSTOMIZATION_ENTITY_TYPES: CustomizationEntityType[] = [
  'vehicle',
  'empty-stop',
  'stop-with-passenger',
  'all',
];

export type CUSTOMIZATION_ZOOM = 'zoomed-in' | 'zoomed-out' | 'any';

export const CUSTOMIZATION_ZOOMS: CUSTOMIZATION_ZOOM[] = [
  'zoomed-in',
  'zoomed-out',
  'any',
];

export type BackgroundShapeType =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'cross'
  | 'diamond';

export const BACKGROUND_SHAPE_TYPES: BackgroundShapeType[] = [
  'circle',
  'square',
  'triangle',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'cross',
  'diamond',
];

export interface CustomizationFields {
  /**
   * The tags of the entity this texture is for.
   *
   * If multiple tags are provided, the texture will be applied only if all tags match.
   */
  tags: string[];

  /**
   * The mode of the vehicle this texture is for.
   *
   * If null, the mode will not be considered when applying the texture.
   */
  mode: string | null;

  type: CustomizationEntityType;

  zoom: CUSTOMIZATION_ZOOM;
}

export interface CustomTexture extends CustomizationFields {
  url: string;
}

export interface BackgroundShape extends CustomizationFields {
  shape: BackgroundShapeType;

  /**
   * The color of the background shape.
   */
  color: string;
}

export interface TextureSaveData {
  version: number;

  vehicleTextureUrl: string;
  stopWithPassengerTextureUrl: string;

  zoomedOutVehicleTextureUrl: string;
  zoomedOutStopWithPassengerTextureUrl: string;

  emptyStopTextureUrl: string;
  zoomedOutEmptyStopTextureUrl: string;

  customTextures: CustomTexture[];

  backgroundShapes: BackgroundShape[];

  colorPresetIndex: number;
  customColors: string[];
}

@Injectable({
  providedIn: 'root',
})
export class SpritesService {
  // MARK: Properties
  readonly VERSION = 5;
  readonly SPRITE_SIZE = 40; // px
  readonly BACKGROUND_SHAPE_SIZE = 60; // px

  private readonly KEY_TEXTURES = 'multimodal.textures';

  readonly DEFAULT_UNDEFINED_TEXTURE_URL = '/images/undefined-texture.png';
  readonly DEFAULT_VEHICLE_TEXTURE_URL = '/images/vehicle.png';
  readonly DEFAULT_STOP_WITH_PASSENGER_TEXTURE_URL =
    '/images/stop-with-passenger.png';
  readonly DEFAULT_EMPTY_STOP_TEXTURE_URL = '/images/empty-stop.png';
  readonly DEFAULT_ZOOMED_OUT_VEHICLE_TEXTURE_URL =
    '/images/zoomed-out-vehicle.png';
  readonly DEFAULT_ZOOMED_OUT_STOP_WITH_PASSENGER_TEXTURE_URL =
    '/images/zoomed-out-stop-with-passenger.png';
  readonly DEFAULT_ZOOMED_OUT_EMPTY_STOP_TEXTURE_URL =
    '/images/zoomed-out-empty-stop.png';

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

  private _useZoomedOutSprites = false;
  private _vehicleSpriteScale = 1;
  private _passengerSpriteScale = 1;

  private _vehicleTexture = Texture.from(this.DEFAULT_VEHICLE_TEXTURE_URL);
  private _stopWithPassengerTexture = Texture.from(
    this.DEFAULT_STOP_WITH_PASSENGER_TEXTURE_URL,
  );
  private _emptyStopTexture = Texture.from(this.DEFAULT_EMPTY_STOP_TEXTURE_URL);

  private _zoomedOutVehicleTexture = Texture.from(
    this.DEFAULT_ZOOMED_OUT_VEHICLE_TEXTURE_URL,
  );
  private _zoomedOutStopWithPassengerTexture = Texture.from(
    this.DEFAULT_ZOOMED_OUT_STOP_WITH_PASSENGER_TEXTURE_URL,
  );
  private _zoomedOutEmptyStopTexture = Texture.from(
    this.DEFAULT_ZOOMED_OUT_EMPTY_STOP_TEXTURE_URL,
  );

  private _customTextures: CustomTexture[] = [];

  private _backgroundShapes: BackgroundShape[] = [];

  private _colorPresetIndex = 0;

  private _customColors: string[] = ['#00ff00', '#ff0000']; // Default custom preset

  private _currentColorPreset: string[] = this.PRESET_LIGHT_COLOR_THEME; // Default preset

  private _textureMap = new Map<string, Texture>();

  // MARK: Getters
  get useZoomedOutSprites(): boolean {
    return this._useZoomedOutSprites;
  }

  get vehicleSpriteScale(): number {
    return this._vehicleSpriteScale;
  }

  get passengerSpriteScale(): number {
    return this._passengerSpriteScale;
  }

  get vehicleTexture(): Texture {
    return this._vehicleTexture;
  }

  get stopWithPassengerTexture(): Texture {
    return this._stopWithPassengerTexture;
  }

  get emptyStopTexture(): Texture {
    return this._emptyStopTexture;
  }

  get zoomedOutVehicleTexture(): Texture {
    return this._zoomedOutVehicleTexture;
  }

  get zoomedOutStopWithPassengerTexture(): Texture {
    return this._zoomedOutStopWithPassengerTexture;
  }

  get zoomedOutEmptyStopTexture(): Texture {
    return this._zoomedOutEmptyStopTexture;
  }

  get colorPresetIndex(): number {
    return this._colorPresetIndex;
  }

  get customColors(): string[] {
    return this._customColors;
  }

  get currentColorPreset(): string[] {
    return this._currentColorPreset;
  }

  get customTextures(): CustomTexture[] {
    return structuredClone(this._customTextures);
  }

  get backgroundShapes(): BackgroundShape[] {
    return structuredClone(this._backgroundShapes);
  }

  // MARK: Constructor
  constructor() {
    this.loadTexturesData();
  }

  // MARK: Utilities
  calculateSpriteScales(utils: L.PixiOverlayUtils) {
    const MAX_SPRITE_SCALE = 1;
    const MIN_SPRITE_SCALE = 0.2;

    const MAX_SPRITE_ZOOM = 15;
    const SCALE_POWER = 1.5;

    const map = utils.getMap();

    const maxZoom = MAX_SPRITE_ZOOM;
    const currentZoom = map.getZoom();

    const zoomPow = maxZoom - currentZoom;

    this._useZoomedOutSprites = currentZoom < 14;

    let wantedRelativeScale = Math.pow(SCALE_POWER, -zoomPow);
    wantedRelativeScale = Math.min(
      Math.max(wantedRelativeScale, MIN_SPRITE_SCALE),
      MAX_SPRITE_SCALE,
    );

    this._vehicleSpriteScale = wantedRelativeScale / utils.getScale();
    this._passengerSpriteScale = this._vehicleSpriteScale * 0.75;
  }

  saveTextureData(
    vehicleTextureUrl: string,
    stopWithPassengerTextureUrl: string,
    emptyStopTextureUrl: string,
    zoomedOutVehicleTextureUrl: string,
    zoomedOutStopWithPassengerTextureUrl: string,
    zoomedOutEmptyStopTextureUrl: string,
    customTextures: CustomTexture[],
    backgroundShapes: BackgroundShape[],
    colorPresetIndex: number,
    customColors: string[],
  ) {
    const saveData: TextureSaveData = {
      version: this.VERSION,
      vehicleTextureUrl,
      stopWithPassengerTextureUrl,
      emptyStopTextureUrl,
      zoomedOutVehicleTextureUrl,
      zoomedOutStopWithPassengerTextureUrl,
      zoomedOutEmptyStopTextureUrl,
      customTextures,
      backgroundShapes,
      colorPresetIndex,
      customColors,
    };

    localStorage.setItem(this.KEY_TEXTURES, JSON.stringify(saveData));

    this.applyTexturesData(saveData);
  }

  // MARK: Textures
  getVehicleTexture(mode: string | null, tags: string[]): Texture {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    const firstMatchingTexture = this._customTextures.find(
      (texture) =>
        ['vehicle', 'all'].includes(texture.type) &&
        [currentZoom, 'any'].includes(texture.zoom) &&
        texture.tags.every((tag) => tags.includes(tag)) &&
        (texture.mode === null || texture.mode === mode),
    );

    const defaultTexture = this._useZoomedOutSprites
      ? this._zoomedOutVehicleTexture
      : this._vehicleTexture;

    return (
      this._textureMap.get(firstMatchingTexture?.url ?? '') ?? defaultTexture
    );
  }

  /**
   * @deprecated passenger are not displayed anymore, stops are used instead.
   */
  getCurrentPassengerTexture(): Texture {
    return this._useZoomedOutSprites
      ? this._zoomedOutStopWithPassengerTexture
      : this._stopWithPassengerTexture;
  }

  getStopWithPassengerTexture(
    tags: string[],
    passengerTags: string[],
  ): Texture {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    // If the stop has no tag, we use the passenger tags instead.
    const usedTags = tags.length > 0 ? tags : passengerTags;

    const firstMatchingTexture = this._customTextures.find(
      (texture) =>
        ['stop-with-passenger', 'all'].includes(texture.type) &&
        [currentZoom, 'any'].includes(texture.zoom) &&
        texture.tags.every((tag) => usedTags.includes(tag)),
    );

    const defaultTexture = this._useZoomedOutSprites
      ? this._zoomedOutStopWithPassengerTexture
      : this._stopWithPassengerTexture;

    return (
      this._textureMap.get(firstMatchingTexture?.url ?? '') ?? defaultTexture
    );
  }

  getEmptyStopTexture(tags: string[]): Texture {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    const firstMatchingTexture = this._customTextures.find(
      (texture) =>
        ['empty-stop', 'all'].includes(texture.type) &&
        [currentZoom, 'any'].includes(texture.zoom) &&
        texture.tags.every((tag) => tags.includes(tag)),
    );

    const defaultTexture = this._useZoomedOutSprites
      ? this._zoomedOutEmptyStopTexture
      : this._emptyStopTexture;

    return (
      this._textureMap.get(firstMatchingTexture?.url ?? '') ?? defaultTexture
    );
  }

  // MARK: Background shapes
  drawVehicleBackgroundShape(
    graphics: Graphics,
    mode: string | null,
    tags: string[],
  ): void {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    const firstMatchingBackgroundShape = this._backgroundShapes.find(
      (backgroundShape) =>
        ['vehicle', 'all'].includes(backgroundShape.type) &&
        [currentZoom, 'any'].includes(backgroundShape.zoom) &&
        backgroundShape.tags.every((tag) => tags.includes(tag)) &&
        (backgroundShape.mode === null || backgroundShape.mode === mode),
    );

    if (!firstMatchingBackgroundShape) {
      graphics.clear();
      return;
    }

    this.drawShape(
      graphics,
      firstMatchingBackgroundShape.shape,
      firstMatchingBackgroundShape.color,
    );
  }

  drawStopWithPassengerBackgroundShape(
    graphics: Graphics,
    tags: string[],
    passengerTags: string[],
  ): void {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    // If the stop has no tag, we use the passenger tags instead.
    const usedTags = tags.length > 0 ? tags : passengerTags;

    const firstMatchingBackgroundShape = this._backgroundShapes.find(
      (backgroundShape) =>
        ['stop-with-passenger', 'all'].includes(backgroundShape.type) &&
        [currentZoom, 'any'].includes(backgroundShape.zoom) &&
        backgroundShape.tags.every((tag) => usedTags.includes(tag)),
    );

    if (!firstMatchingBackgroundShape) {
      graphics.clear();
      return;
    }

    this.drawShape(
      graphics,
      firstMatchingBackgroundShape.shape,
      firstMatchingBackgroundShape.color,
    );
  }

  drawEmptyStopBackgroundShape(graphics: Graphics, tags: string[]) {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    const firstMatchingBackgroundShape = this._backgroundShapes.find(
      (backgroundShape) =>
        ['empty-stop', 'all'].includes(backgroundShape.type) &&
        [currentZoom, 'any'].includes(backgroundShape.zoom) &&
        backgroundShape.tags.every((tag) => tags.includes(tag)),
    );

    if (!firstMatchingBackgroundShape) {
      graphics.clear();
      return;
    }

    this.drawShape(
      graphics,
      firstMatchingBackgroundShape.shape,
      firstMatchingBackgroundShape.color,
    );
  }

  // MARK: Private utilities
  private loadTexturesData() {
    const savedTexturesJson = localStorage.getItem(this.KEY_TEXTURES);
    if (!savedTexturesJson) return;

    const savedTexturesData = JSON.parse(savedTexturesJson) as TextureSaveData;
    if (
      savedTexturesData.version === undefined ||
      savedTexturesData.version !== this.VERSION
    )
      return;

    this.applyTexturesData(savedTexturesData);
  }

  private applyTexturesData(textureSaveData: TextureSaveData) {
    // Create default textures
    this._vehicleTexture = Texture.from(textureSaveData.vehicleTextureUrl);

    this._stopWithPassengerTexture = Texture.from(
      textureSaveData.stopWithPassengerTextureUrl,
    );

    this._emptyStopTexture = Texture.from(textureSaveData.emptyStopTextureUrl);

    this._zoomedOutVehicleTexture = Texture.from(
      textureSaveData.zoomedOutVehicleTextureUrl,
    );

    this._zoomedOutStopWithPassengerTexture = Texture.from(
      textureSaveData.zoomedOutStopWithPassengerTextureUrl,
    );

    this._zoomedOutEmptyStopTexture = Texture.from(
      textureSaveData.zoomedOutEmptyStopTextureUrl,
    );

    // Copy color presets
    this._colorPresetIndex = textureSaveData.colorPresetIndex;
    this._customColors = textureSaveData.customColors;

    if (this._colorPresetIndex === 0)
      this._currentColorPreset = this.PRESET_LIGHT_COLOR_THEME;
    if (this._colorPresetIndex === 1)
      this._currentColorPreset = this.PRESET_SATURATED_COLOR_THEME;
    if (
      this._colorPresetIndex === 2 &&
      textureSaveData.customColors.length >= 2
    )
      this._currentColorPreset = textureSaveData.customColors;

    // Create custom textures
    this._customTextures = textureSaveData.customTextures;

    const urls = Array.from(new Set(this._customTextures.map((t) => t.url)));

    this._textureMap.clear();
    urls.forEach((url) => {
      this._textureMap.set(url, Texture.from(url));
    });

    // Create background shapes
    this._backgroundShapes = structuredClone(textureSaveData.backgroundShapes);
  }

  private drawShape(
    graphics: Graphics,
    shape: BackgroundShapeType,
    color: ColorSource,
  ) {
    const size = this.BACKGROUND_SHAPE_SIZE;

    graphics.clear();
    graphics.beginFill(color);

    switch (shape) {
      case 'circle':
        graphics.drawCircle(0, 0, size / 2);
        graphics.scale.set(4 / Math.PI);
        break;
      case 'square':
        graphics.drawRect(-size / 2, -size / 2, size, size);
        break;
      case 'triangle':
        graphics.drawPolygon(this.createPolygonCoordinates(3, size / 2));
        graphics.scale.set(1.5);
        break;
      case 'pentagon':
        graphics.drawPolygon(this.createPolygonCoordinates(5, size / 2));
        graphics.scale.set(4 / Math.PI);
        break;
      case 'hexagon':
        graphics.drawPolygon(this.createPolygonCoordinates(6, size / 2, 0));
        graphics.scale.set(4 / Math.PI);
        break;
      case 'octagon':
        graphics.drawPolygon(
          this.createPolygonCoordinates(8, size / 2, 360 / 16),
        );
        graphics.scale.set(4 / Math.PI);
        break;
      case 'star':
        {
          const outerRadius = size / 2;
          const innerRadius = outerRadius / 2.5; // Adjust inner radius for star

          const outerPolygon = this.createPolygonCoordinates(
            5,
            outerRadius,
            90,
          );

          const innerPolygon = this.createPolygonCoordinates(
            5,
            innerRadius,
            90 + 36, // Offset by 36 degrees for star points
          );

          const starCoordinates = [];
          for (let i = 0; i < outerPolygon.length; i += 2) {
            starCoordinates.push(innerPolygon[i], innerPolygon[i + 1]);
            starCoordinates.push(outerPolygon[i], outerPolygon[i + 1]);
          }

          graphics.drawPolygon(starCoordinates);
          graphics.scale.set(1.8);
        }
        break;
      case 'cross':
        graphics.drawRect(-size / 2, -size / 8, size, size / 4);
        graphics.drawRect(-size / 8, -size / 2, size / 4, size);
        graphics.rotation = Math.PI / 4; // Rotate to make it a cross
        graphics.scale.set(1.5);
        break;
      case 'diamond':
        graphics.drawPolygon(this.createPolygonCoordinates(4, size / 2));
        graphics.scale.set(Math.SQRT2);
        break;
    }

    graphics.endFill();
  }

  private createPolygonCoordinates(
    numberOfPoints: number,
    radius: number,
    startAngle = 90, // In degrees, starting at 90 degrees
  ): number[] {
    const coordinates: number[] = [];
    for (let i = 0; i < numberOfPoints; i++) {
      // Start at 90 degrees and go clockwise
      const angle = ((i * 360) / numberOfPoints - startAngle) * (Math.PI / 180);
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      coordinates.push(x, y);
    }
    return coordinates;
  }
}

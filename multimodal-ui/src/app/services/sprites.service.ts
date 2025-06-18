import { Injectable } from '@angular/core';
import { Texture } from '@pixi/core';
import * as L from 'leaflet';

export type CustomTextureType =
  | 'vehicle'
  | 'empty-stop'
  | 'stop-with-passenger';

export const CUSTOM_TEXTURE_TYPES: CustomTextureType[] = [
  'vehicle',
  'empty-stop',
  'stop-with-passenger',
];

export type CustomTextureZoom = 'zoomed-in' | 'zoomed-out' | 'any';

export const CUSTOM_TEXTURE_ZOOMS: CustomTextureZoom[] = [
  'zoomed-in',
  'zoomed-out',
  'any',
];

export interface CustomTexture {
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

  type: CustomTextureType;

  zoom: CustomTextureZoom;

  url: string;
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

  colorPresetIndex: number;
  customColors: string[];
}

@Injectable({
  providedIn: 'root',
})
export class SpritesService {
  readonly VERSION = 4;
  readonly SPRITE_SIZE = 40; // px

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

  private _colorPresetIndex = 0;

  private _customColors: string[] = ['#00ff00', '#ff0000']; // Default custom preset

  private _currentColorPreset: string[] = this.PRESET_LIGHT_COLOR_THEME; // Default preset

  private _textureMap = new Map<string, Texture>();

  // Getters
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

  constructor() {
    this.loadTexturesData();
  }

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
      colorPresetIndex,
      customColors,
    };

    localStorage.setItem(this.KEY_TEXTURES, JSON.stringify(saveData));

    this.applyTexturesData(saveData);
  }

  getVehicleTexture(mode: string | null, tags: string[]) {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    const firstMatchingTexture = this._customTextures.find(
      (texture) =>
        texture.type === 'vehicle' &&
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
  getCurrentPassengerTexture() {
    return this._useZoomedOutSprites
      ? this._zoomedOutStopWithPassengerTexture
      : this._stopWithPassengerTexture;
  }

  getStopWithPassengerTexture(tags: string[]) {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    const firstMatchingTexture = this._customTextures.find(
      (texture) =>
        texture.type === 'stop-with-passenger' &&
        [currentZoom, 'any'].includes(texture.zoom) &&
        texture.tags.every((tag) => tags.includes(tag)),
    );

    const defaultTexture = this._useZoomedOutSprites
      ? this._zoomedOutStopWithPassengerTexture
      : this._stopWithPassengerTexture;

    return (
      this._textureMap.get(firstMatchingTexture?.url ?? '') ?? defaultTexture
    );
  }

  getEmptyStopTexture(tags: string[]) {
    const currentZoom = this._useZoomedOutSprites ? 'zoomed-out' : 'zoomed-in';

    const firstMatchingTexture = this._customTextures.find(
      (texture) =>
        texture.type === 'empty-stop' &&
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
  }
}

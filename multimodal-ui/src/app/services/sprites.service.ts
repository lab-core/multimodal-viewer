import * as L from 'leaflet';
import { Injectable } from '@angular/core';
import { Texture } from '@pixi/core';

export interface CustomTexture {
  mode: string;
  url: string;
}

export interface TextureSaveData {
  version: number;

  vehicleTextureUrl: string;
  passengerTextureUrl: string;

  zoomOutVehicleTextureUrl: string;
  zoomOutPassengerTextureUrl: string;

  stopTextureUrl: string;

  vehicleModeTextures: CustomTexture[];

  colorPresetIndex: number;
  customColors: string[];
}

@Injectable({
  providedIn: 'root',
})
export class SpritesService {
  readonly VERSION = 3;
  readonly SPRITE_SIZE = 40;

  private readonly KEY_TEXTURES = 'multimodal.textures';

  readonly DEFAULT_VEHICLE_TEXTURE_URL = '/images/sample-bus.png';
  readonly DEFAULT_PASSENGER_TEXTURE_URL = '/images/sample-wait.png';
  readonly DEFAULT_ZOOM_OUT_VEHICLE_TEXTURE_URL =
    '/images/zoom-out-vehicle.png';
  readonly DEFAULT_ZOOM_OUT_PASSENGER_TEXTURE_URL =
    '/images/zoom-out-passenger.png';
  readonly DEFAULT_STOP_TEXTURE_URL = '/images/sample-stop.png';

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
  private _passengerTexture = Texture.from(this.DEFAULT_PASSENGER_TEXTURE_URL);

  private _zoomOutVehicleTexture = Texture.from(
    this.DEFAULT_ZOOM_OUT_VEHICLE_TEXTURE_URL,
  );
  private _zoomOutPassengerTexture = Texture.from(
    this.DEFAULT_ZOOM_OUT_PASSENGER_TEXTURE_URL,
  );

  private _stopTexture = Texture.from(this.DEFAULT_STOP_TEXTURE_URL);

  private _vehicleModeTextures: CustomTexture[] = [];

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

  get passengerTexture(): Texture {
    return this._passengerTexture;
  }

  get zoomOutVehicleTexture(): Texture {
    return this._zoomOutVehicleTexture;
  }

  get zoomOutPassengerTexture(): Texture {
    return this._zoomOutPassengerTexture;
  }

  get stopTexture(): Texture {
    return this._stopTexture;
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
  ///////////

  get vehicleModeTextures(): CustomTexture[] {
    return structuredClone(this._vehicleModeTextures);
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
    passengerTextureUrl: string,
    zoomOutVehicleTextureUrl: string,
    zoomOutPassengerTextureUrl: string,
    stopTextureUrl: string,
    vehicleModeTextures: CustomTexture[],
    colorPresetIndex: number,
    customColors: string[],
  ) {
    const saveData: TextureSaveData = {
      version: this.VERSION,
      vehicleTextureUrl,
      passengerTextureUrl,
      zoomOutVehicleTextureUrl,
      zoomOutPassengerTextureUrl,
      stopTextureUrl,
      vehicleModeTextures,
      colorPresetIndex,
      customColors,
    };

    localStorage.setItem(this.KEY_TEXTURES, JSON.stringify(saveData));

    this.applyTexturesData(saveData);
  }

  /**
   * Vehicle texture respective of the map zoom.
   */
  getCurrentVehicleTexture(mode: string | null) {
    if (this._useZoomedOutSprites) return this._zoomOutVehicleTexture;
    const url = this._textureMap.get(mode ?? '');
    return url ?? this._vehicleTexture;
  }

  /**
   * Passenger texture respective of the map zoom.
   */
  getCurrentPassengerTexture() {
    return this._useZoomedOutSprites
      ? this._zoomOutPassengerTexture
      : this._passengerTexture;
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
    this._vehicleTexture = Texture.from(textureSaveData.vehicleTextureUrl);
    this._passengerTexture = Texture.from(textureSaveData.passengerTextureUrl);

    this._zoomOutVehicleTexture = Texture.from(
      textureSaveData.zoomOutVehicleTextureUrl,
    );
    this._zoomOutPassengerTexture = Texture.from(
      textureSaveData.zoomOutPassengerTextureUrl,
    );

    this._stopTexture = Texture.from(textureSaveData.stopTextureUrl);

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

    this._vehicleModeTextures = textureSaveData.vehicleModeTextures;
    this._textureMap.clear();
    for (const vehicleModeTexture of textureSaveData.vehicleModeTextures)
      this._textureMap.set(
        vehicleModeTexture.mode,
        Texture.from(vehicleModeTexture.url),
      );
  }
}

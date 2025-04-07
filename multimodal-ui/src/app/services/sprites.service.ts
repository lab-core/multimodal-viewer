import * as L from 'leaflet';
import { Injectable } from '@angular/core';
import { CustomSprite } from '../interfaces/entity.model';
import { Texture } from '@pixi/core';

export interface SpriteSaveData {
  version: number;

  vehicleSprite: string;
  passengerSprite: string;

  zoomOutVehicleSprite: string;
  zoomOutPassengerSprite: string;

  customSprites: CustomSprite[];
}

@Injectable({
  providedIn: 'root',
})
export class SpritesService {
  readonly VERSION = 1;
  readonly SPRITE_SIZE = 40;

  readonly DEFAULT_VEHICLE_SPRITE = '/images/sample-bus.png';
  readonly DEFAULT_PASSENGER_SPRITE = '/images/sample-wait.png';
  readonly DEFAULT_ZOOM_OUT_VEHICLE_SPRITE = '/images/zoom-out-vehicle.png';
  readonly DEFAULT_ZOOM_OUT_PASSENGER_SPRITE = 'images/zoom-out-passenger.png';

  private _useZoomedOutSprites = false;
  private _vehicleSpriteScale = 1;
  private _passengerSpriteScale = 1;

  private readonly KEY_SPRITES: string = 'multimodal.sprites';

  private _vehicleSprite = Texture.from(this.DEFAULT_VEHICLE_SPRITE);
  private _passengerSprite = Texture.from(this.DEFAULT_PASSENGER_SPRITE);
  private _zoomOutVehicleSprite = Texture.from(
    this.DEFAULT_ZOOM_OUT_VEHICLE_SPRITE,
  );
  private _zoomOutPassengerSprite = Texture.from(
    this.DEFAULT_ZOOM_OUT_PASSENGER_SPRITE,
  );

  private _customSprites: CustomSprite[] = [];

  private _spriteMap = new Map<string, Texture>();

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

  get vehicleSprite(): Texture {
    return this._vehicleSprite;
  }

  get passengerSprite(): Texture {
    return this._passengerSprite;
  }

  get zoomOutVehicleSprite(): Texture {
    return this._zoomOutVehicleSprite;
  }

  get zoomOutPassengerSprite(): Texture {
    return this._zoomOutPassengerSprite;
  }
  ///////////

  get customSprites(): CustomSprite[] {
    return structuredClone(this._customSprites);
  }

  constructor() {
    this.loadSpritesData();
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

  saveSpriteData(
    vehicleSprite: string,
    passengerSprite: string,
    zoomOutVehicleSprite: string,
    zoomOutPassengerSprite: string,
    customSprites: CustomSprite[],
  ) {
    const saveData: SpriteSaveData = {
      version: this.VERSION,
      vehicleSprite,
      passengerSprite,
      zoomOutVehicleSprite,
      zoomOutPassengerSprite,
      customSprites,
    };

    localStorage.setItem(this.KEY_SPRITES, JSON.stringify(saveData));

    this.applySpritesData(saveData);
  }

  getVehicleSprite(mode: string | null) {
    if (this._useZoomedOutSprites) return this._zoomOutVehicleSprite;
    const url = this._spriteMap.get(mode ?? '');
    return url ?? this._vehicleSprite;
  }

  getPassengerSprite() {
    return this._useZoomedOutSprites
      ? this._zoomOutPassengerSprite
      : this._passengerSprite;
  }

  private loadSpritesData() {
    const savedSpritesJson = localStorage.getItem(this.KEY_SPRITES);
    if (!savedSpritesJson) return;

    const savedSpritesData = JSON.parse(savedSpritesJson) as SpriteSaveData;
    if (
      savedSpritesData.version === undefined ||
      savedSpritesData.version !== this.VERSION
    )
      return;

    this.applySpritesData(savedSpritesData);
  }

  private applySpritesData(spriteSaveData: SpriteSaveData) {
    this._vehicleSprite = Texture.from(spriteSaveData.vehicleSprite);
    this._passengerSprite = Texture.from(spriteSaveData.passengerSprite);

    this._zoomOutVehicleSprite = Texture.from(
      spriteSaveData.zoomOutVehicleSprite,
    );
    this._zoomOutPassengerSprite = Texture.from(
      spriteSaveData.zoomOutPassengerSprite,
    );

    this._customSprites = spriteSaveData.customSprites;
    this._spriteMap.clear();
    for (const customSprite of spriteSaveData.customSprites)
      this._spriteMap.set(customSprite.mode, Texture.from(customSprite.url));
  }
}

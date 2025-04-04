import { Injectable } from '@angular/core';
import { CustomSprite } from '../interfaces/entity.model';

export interface SpriteSaveData {
  defaultVehicleSprite: string;
  defaultPassengerSprite: string;
  customSprites: CustomSprite[];
}

@Injectable({
  providedIn: 'root',
})
export class SpritesService {
  readonly DEFAULT_VEHICLE_SPRITE = '/images/sample-bus.png';
  readonly DEFAULT_PASSENGER_SPRITE = '/images/sample-wait.png';
  readonly SPRITE_SIZE = 40;

  private readonly KEY_SPRITES: string = 'multimodal.sprites';

  private _defaultVehicleSprite = this.DEFAULT_VEHICLE_SPRITE;
  private _defaultPassengerSprite = this.DEFAULT_PASSENGER_SPRITE;
  private _customSprites: CustomSprite[] = [];

  private _spriteMap = new Map<string, string>();

  get defaultVehicleSprite(): string {
    return this._defaultVehicleSprite;
  }

  get defaultPassengerSprite(): string {
    return this._defaultPassengerSprite;
  }

  get customSprites(): CustomSprite[] {
    return structuredClone(this._customSprites);
  }

  constructor() {
    this.loadSpritesData();
  }

  saveSpriteData(
    defaultVehicleSprite: string,
    defaultPassengerSprite: string,
    customSprites: CustomSprite[],
  ) {
    const saveData: SpriteSaveData = {
      defaultVehicleSprite,
      defaultPassengerSprite,
      customSprites,
    };

    localStorage.setItem(this.KEY_SPRITES, JSON.stringify(saveData));

    this.applySpritesData(saveData);
  }

  getVehicleSprite(mode: string) {
    const url = this._spriteMap.get(mode);
    return url ?? this._defaultVehicleSprite;
  }

  private loadSpritesData() {
    const savedSpritesJson = localStorage.getItem(this.KEY_SPRITES);
    if (!savedSpritesJson) return;

    const savedSpritesData = JSON.parse(savedSpritesJson) as SpriteSaveData;
    this.applySpritesData(savedSpritesData);
  }

  private applySpritesData(spriteSaveData: SpriteSaveData) {
    this._defaultVehicleSprite = spriteSaveData.defaultVehicleSprite;
    this._defaultPassengerSprite = spriteSaveData.defaultPassengerSprite;
    this._customSprites = spriteSaveData.customSprites;

    this._spriteMap.clear();
    for (const customSprite of spriteSaveData.customSprites)
      this._spriteMap.set(customSprite.mode, customSprite.url);
  }
}

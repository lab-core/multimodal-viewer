import { Injectable } from '@angular/core';
import { CustomSprite } from '../interfaces/entity.model';

interface SpriteSaveData {
  defaultVehicleSprite: string;
  defaultPassengerSprite: string;
  customSprites: CustomSprite[];
}

@Injectable({
  providedIn: 'root',
})
export class SpritesService {
  private readonly KEY_SPRITES: string = 'multimodal.sprites';

  private _defaultVehicleSprite = '/images/sample-bus.png';
  private _defaultPassengerSprite = '/images/sample-walk.png';
  private _customSprites: CustomSprite[] = [];

  private _spriteSet = new Map<string, string>();

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
    const url = this._spriteSet.get(mode);
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

    this._spriteSet.clear();
    for (const customSprite of spriteSaveData.customSprites)
      this._spriteSet.set(customSprite.mode, customSprite.url);
  }
}

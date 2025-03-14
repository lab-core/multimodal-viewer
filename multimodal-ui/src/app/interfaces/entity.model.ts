import { Sprite } from 'pixi.js';

export interface Entity<T> {
  sprite: Sprite;
  requestedRotation: number;
  data: T;
}

// Maybe will change (VehicleEntity extends Sprite?)
export interface EntityOwner<T> extends Sprite {
  entity: T;
}

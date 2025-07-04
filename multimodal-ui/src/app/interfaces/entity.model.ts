import { BitmapText, Graphics, Sprite } from 'pixi.js';

export interface Entity<T> {
  sprites: Sprite[];
  texts: BitmapText[];
  graphics: Graphics[];
  show: boolean;
  data: T;
}

export type EntityFilterMode = 'all' | 'favorites';

export type EntityType = 'vehicle' | 'passenger' | 'stop';

import { BitmapText, Sprite } from 'pixi.js';

export interface Entity<T> {
  sprite: Sprite;
  text?: BitmapText;
  show: boolean;
  data: T;
}

export type EntityFilterMode = 'all' | 'favorites';

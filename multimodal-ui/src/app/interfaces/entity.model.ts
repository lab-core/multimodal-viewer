import { BitmapText, Sprite } from 'pixi.js';

export interface Entity<T> {
  sprite: Sprite;
  show: boolean;
  data: T;
}

export interface TextEntity<T> extends Entity<T> {
  text: BitmapText;
}

export type EntityFilterMode = 'all' | 'favorites';

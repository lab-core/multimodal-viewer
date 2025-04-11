import { BitmapText, Sprite } from 'pixi.js';

export interface Entity<T> {
  sprite: Sprite;
  show: boolean;
  data: T;
}

export interface TextEntity<T> extends Entity<T> {
  text: BitmapText;
}

export interface DualEntity<T> extends Entity<T> {
  otherSprite: Sprite;
}

export interface DualTextEntity<T> extends DualEntity<T>, TextEntity<T> {}

export type EntityFilterMode = 'all' | 'favorites';

export interface EntityInfo {
  id: string;
  name: string;
}

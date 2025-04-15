import { BitmapText, Sprite } from 'pixi.js';

export interface Entity<T> {
  sprites: Sprite[];
  texts: BitmapText[];
  show: boolean;
  data: T;
}

export type EntityFilterMode = 'all' | 'favorites';

export interface EntityInfo {
  id: string;
  name: string;
}

export type EntityType = 'vehicle' | 'passenger' | 'stop';

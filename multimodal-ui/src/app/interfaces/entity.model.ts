import { BitmapText, Container, Graphics, Sprite } from 'pixi.js';

export interface Entity<T> {
  sprites: Sprite[];
  texts: BitmapText[];
  graphics: Graphics[];
  container: Container;
  backgroundContainer: Container;
  data: T;
}

export type EntityFilterMode = 'all' | 'favorites';

export type EntityType = 'vehicle' | 'passenger' | 'stop';

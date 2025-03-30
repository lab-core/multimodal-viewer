import { Sprite, Text } from 'pixi.js';

export interface Entity<T> {
  sprite: Sprite;
  text?: Text;
  show: boolean;
  data: T;
}

export type EntityFilterMode = 'all' | 'favorites';

import { BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import { Tagged } from './tags.model';

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

export const ENTITY_TYPES: EntityType[] = ['vehicle', 'passenger', 'stop'];

export interface EntityMetadata extends Tagged {
  id: string;
  entityType: EntityType;
  name: string;
}

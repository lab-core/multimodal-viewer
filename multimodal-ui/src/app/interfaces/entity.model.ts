import { BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import { isTagged, Tagged } from './tags.model';

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

export function isEntityType(value: unknown): value is EntityType {
  return ENTITY_TYPES.includes(value as EntityType);
}

export interface EntityMetadata extends Tagged {
  id: string;
  entityType: EntityType;
  name: string;
}

export function isEntityMetadata(value: unknown): value is EntityMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('id' in value) || typeof value.id !== 'string') {
    return false;
  }

  if (!('entityType' in value) || !isEntityType(value.entityType)) {
    return false;
  }

  if (!('name' in value) || typeof value.name !== 'string') {
    return false;
  }

  if (!isTagged(value)) {
    return false;
  }

  return true;
}

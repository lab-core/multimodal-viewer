import { Tagged } from './tags.model';

export type EntityFilterMode = 'all' | 'favorites';

export type EntityType = 'vehicle' | 'passenger' | 'stop';

export const ENTITY_TYPES: EntityType[] = ['vehicle', 'passenger', 'stop'];

export interface EntityMetadata extends Tagged {
  id: string;
  entityType: EntityType;
  name: string;
  error: string | null; // If not null, there is an error with the entity
}

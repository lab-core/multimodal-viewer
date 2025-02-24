import { pixiOverlay, Point } from 'leaflet';
import { Sprite } from 'pixi.js';
import { Vehicle } from './simulation.model';

export interface Entity {
  sprite: Sprite;
  requestedRotation: number;
}

export interface VehicleEntity extends Entity {
  data: Vehicle;
}

// Maybe will change (VehicleEntity extends Sprite?)
export interface EntityOwner extends Sprite {
  entity: VehicleEntity
}

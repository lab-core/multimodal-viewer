import { pixiOverlay, Point } from 'leaflet';
import { Sprite } from 'pixi.js';
import { Vehicle } from './simulation.model';

export interface Entity {
  sprite: Sprite;
  startPos: Point;
  endPos: Point;
  requestedRotation: number;
  timeToReach: number;
  currentTime: number;
}

export interface VehicleEntity extends Entity {
  polylineNo: number;
  lineNo: number;
  data: Vehicle;
}

// Maybe will change (VehicleEntity extends Sprite?)
export interface EntityOwner extends Sprite {
  entity: Entity
}

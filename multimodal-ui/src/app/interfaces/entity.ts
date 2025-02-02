import { Point } from "leaflet";
import { Sprite } from "pixi.js";
export interface Entity {
    sprite: Sprite;
    startPos: Point;
    endPos: Point;
    speed: number;
    timeToReach: number;
    currentTime: number;
}

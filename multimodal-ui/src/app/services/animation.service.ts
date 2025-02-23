import { Injectable, signal, WritableSignal } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { Entity, EntityOwner, VehicleEntity } from '../interfaces/entity.model';
import { Vehicle } from '../interfaces/simulation.model';
import { Polylines } from '../interfaces/simulation.model';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  fpsSignal: WritableSignal<number> = signal(0);

  private ticker: PIXI.Ticker = new PIXI.Ticker();
  private vehicles: VehicleEntity[] = [];
  private container = new PIXI.Container();
  private frozen: boolean = false;
  private utils!: L.PixiOverlayUtils;

  private lastSelectedEntity: Entity | undefined;

  addVehicle(vehicle: Vehicle, type = 'sample-bus') {
    if (vehicle.polylines == null) return;
    if (vehicle.polylines[0].polyline.length == 0) return;
    console.log(vehicle);
    this.frozen = false; // Temp

    const sprite = PIXI.Sprite.from(`images/${type}.png`) as EntityOwner;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(1 / this.utils.getScale());
    sprite.interactive = true;
    sprite.on('pointerdown', (e) => this.onEntityPointerdown(e));

    const point = this.utils.latLngToLayerPoint([0, 0]);
    const entity: VehicleEntity = {
      data: vehicle,
      polylineNo: 0,
      lineNo: -1,

      sprite,
      requestedRotation: 0,
      startPos: point,
      endPos: point,
      currentTime: 0,
      timeToReach: 0,
    };
    sprite.entity = entity;
    
    this.updateVehiclePath(entity);
    // entity.sprite.rotation = entity.requestedRotation;

    this.container.addChild(sprite);
    this.vehicles.push(entity);
  }

  clearAnimations() {
    this.container.removeChildren();
    this.vehicles = [];
  }

  freezeAnimations() {
    this.frozen = true;
  }

  runAnimations() {
    this.frozen = false;
  }

  private updateVehiclePositions() {
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicle = this.vehicles[index];
      const secElapsed = this.ticker.deltaMS / 1000;
      vehicle.currentTime += secElapsed;
      vehicle.sprite.rotation += (vehicle.requestedRotation - vehicle.sprite.rotation) * secElapsed;
      let progress = vehicle.currentTime / vehicle.timeToReach;

      if (progress >= 1)  {
        this.updateVehiclePath(vehicle);
        progress = 0;
      }

      // pos = end * progress + start(1 - progress)
      const newPosition = vehicle.endPos
        .multiplyBy(progress)
        .add(vehicle.startPos.multiplyBy(1 - progress));
      vehicle.sprite.x = newPosition.x;
      vehicle.sprite.y = newPosition.y;
    } 
  }

  private updateVehiclePath(vehicle: VehicleEntity) {
    if (vehicle.data.polylines == null) return;

    // Get next path to follow
    let currentPolyline = vehicle.data.polylines[vehicle.polylineNo];
    if (vehicle.lineNo < currentPolyline.polyline.length -2) vehicle.lineNo += 1;
    else {
      currentPolyline =  vehicle.data.polylines[vehicle.polylineNo + 1];
      if (currentPolyline != null)  {
        vehicle.polylineNo += 1;
        vehicle.lineNo = 0;
      }
      else return;
    }

    const geoPosA = currentPolyline.polyline[vehicle.lineNo];
    const geoPosB = currentPolyline.polyline[vehicle.lineNo + 1];
    const pointA = this.utils.latLngToLayerPoint([geoPosA.latitude, geoPosA.longitude]);
    const pointB = this.utils.latLngToLayerPoint([geoPosB.latitude, geoPosB.longitude]);

    // Set orientation
    // const direction = pointB.subtract(pointA);
    // const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
    // vehicle.requestedRotation = angle;

    // Set path
    vehicle.startPos = pointA;
    vehicle.endPos = pointB;
    vehicle.currentTime = 0;
    vehicle.timeToReach = currentPolyline.coefficients[vehicle.lineNo] * 10; // 10 is arbritrary (to be replaced with real data)
  }

  // Called once when Pixi layer is added.
  private onAdd(utils: L.PixiOverlayUtils) {
    console.log('PixiJS layer added.');
  }

  private onMoveEnd(event: L.LeafletEvent) {
    this.vehicles.forEach((entity) => {
      entity.sprite.scale.set(1 / this.utils.getScale());
    });
  }

  private onRedraw(event: L.LeafletEvent) {
    const fps = Math.round(1000 / this.ticker.deltaMS);
    this.fpsSignal.set(fps);

    if (this.frozen) return;
    
    this.updateVehiclePositions();
  }

  private onClick(event: L.LeafletMouseEvent) {
    // this.changeEntitiesDestination(event.latlng);
    // this.addEntity();
  }

  private onEntityPointerdown(event: PIXI.FederatedPointerEvent) {
    const sprite = event.target as EntityOwner;
    if (!sprite) return;

    const entity = sprite.entity;
    if (!entity) return;

    sprite.tint = 0xFFAAAA; // Red
    
    if (this.lastSelectedEntity != null) this.lastSelectedEntity.sprite.tint = 0xFFFFFF; // White
    this.lastSelectedEntity = entity;
  }

  addPixiOverlay(map: L.Map) {
    map.on('click', (event) => {
      this.onClick(event);
    });
    const pixiLayer = (() => {
      return L.pixiOverlay(
        (utils, event) => {
          this.utils = utils;
          if (event.type === 'add') this.onAdd(utils);
          if (event.type === 'moveend') this.onMoveEnd(event);
          if (event.type === 'redraw') this.onRedraw(event);
          this.utils.getRenderer().render(this.container);
        },
        this.container,
        {
          doubleBuffering: true,
        },
      );
    })();

    pixiLayer.addTo(map);

    this.ticker.add(function (delta) {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as L.LeafletEvent);
    });
    this.ticker.start();
  }

  private lines: L.Polyline[] = [];

  removePolylines() {
    this.lines.forEach((line) => line.remove());
    this.lines = [];
  }

  displayPolylines(polylinesByVehicleId: Record<string, Polylines>) {
    this.removePolylines();

    Object.keys(polylinesByVehicleId).forEach((vehicleId) => {
      const polylines = polylinesByVehicleId[vehicleId];
      Object.keys(polylines).forEach((polylineId) => {
        const polyline = polylines[polylineId];
        const points = polyline.polyline.map((point) => ({
          lat: point.latitude,
          lng: point.longitude,
        }));
        const line = L.polyline(points, {
          color: 'blue',
          weight: 5,
          opacity: 0.7,
        });
        line.addTo(this.utils.getMap());
        this.lines.push(line);
      });
    });
  }
}

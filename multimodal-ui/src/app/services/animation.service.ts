import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { Entity, VehicleEntity } from '../interfaces/entity.model';
import { Vehicle } from '../interfaces/simulation.model';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  private ticker: PIXI.Ticker = new PIXI.Ticker();
  private vehicles: VehicleEntity[] = [];
  private container = new PIXI.Container();
  private utils!: L.PixiOverlayUtils;

  addVehicle(vehicle: Vehicle, type = 'sample-bus') {
    if (vehicle.polylines == null) return;
    if (vehicle.polylines[0].polyline.length == 0) return;

    const sprite = PIXI.Sprite.from(`images/${type}.png`);
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(1 / this.utils.getScale());

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
    this.updateVehiclePath(entity);
    // entity.sprite.rotation = entity.requestedRotation;

    this.container.addChild(sprite);
    this.vehicles.push(entity);
  }

  updateVehiclePositions() {
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicle = this.vehicles[index];
      const secElapsed = this.ticker.deltaTime / this.ticker.FPS;
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

  updateVehiclePath(vehicle: VehicleEntity) {
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

  // addEntity(lat: number, lng: number, type = 'sample-car') {
  //   const sprite = PIXI.Sprite.from(`images/${type}.png`);

  //   sprite.anchor.set(0.5, 1);
  //   sprite.scale.set(1 / this.utils.getScale());
  //   this.container.addChild(sprite);

  //   const point = this.utils.latLngToLayerPoint([lat, lng]);
  //   const entity: Entity = {
  //     sprite,
  //     startPos: point,
  //     endPos: point,
  //     currentTime: 0,
  //     timeToReach: 5,
  //   };

  //   this.entities.push(entity);
  // }

  // private changeEntitiesDestination(latlng: L.LatLng) {
  //   this.pointToReach = this.utils.latLngToLayerPoint(latlng);
  //   this.entities.forEach((entity) => {
  //     entity.startPos.x = entity.sprite.x;
  //     entity.startPos.y = entity.sprite.y;
  //     entity.endPos = this.pointToReach;

  //     const distanceVec = entity.endPos.subtract(entity.startPos);
  //     const distance = Math.sqrt(
  //       distanceVec.x * distanceVec.x + distanceVec.y * distanceVec.y,
  //     );
  //     entity.timeToReach = (distance * 0.5) / entity.speed;
  //     entity.currentTime = 0;
  //   });
  // }

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
    this.updateVehiclePositions();
  }

  private onClick(event: L.LeafletMouseEvent) {
    // this.changeEntitiesDestination(event.latlng);
    // this.addEntity();
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
}

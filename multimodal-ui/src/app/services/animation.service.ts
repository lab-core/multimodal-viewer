import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { Entity, EntityOwner } from '../interfaces/entity.model';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedVehicle,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  Passenger,
  Polyline,
  Polylines,
  SimulationEnvironment,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  Vehicle,
} from '../interfaces/simulation.model';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  private readonly _selectedVehicleSignal: WritableSignal<Vehicle | null> =
    signal(null);

  private readonly MIN_LERPABLE_DESYNC_DIFF = 1.5;
  private readonly MAX_LERPABLE_DESYNC_DIFF = 900;

  private readonly WHITE = 0xffffff;
  private readonly LIGHT_RED = 0xffcdcd;
  private readonly LIGHT_BLUE = 0xcdcdff;
  private readonly SATURATED_RED = 0xcd2222;
  private readonly KELLY_GREEN = 0x028a0f;
  private readonly LIGHT_GRAY = 0x666666;

  private pause = false;
  private animationVisualizationTime = 0;
  private lastVisualisationTime = 0;

  private ticker: PIXI.Ticker = new PIXI.Ticker();
  private vehicles: Entity<AnimatedVehicle>[] = [];
  private vehicleEntitiesByVehicleId: Record<string, Entity<AnimatedVehicle>> =
    {};
  private passengersEntities: Entity<AnimatedPassenger>[] = [];
  private container = new PIXI.Container();

  private startTimestamp: number | null = null;
  private endTimestamp: number | null = null;

  private lastScale = 0;
  private utils!: L.PixiOverlayUtils;

  private selectedVehiclePolyline: PIXI.Graphics = new PIXI.Graphics();

  // Variable that are alive for a single frame (could probably improve)
  private frame_onEntityPointerDownCalled = false;
  private frame_pointToFollow: L.LatLngExpression | null = null;

  private previousVehiclesEntities: Entity<AnimatedVehicle>[] = [];
  private previousPassengerEntities: Entity<AnimatedPassenger>[] = [];

  private speed = 1;

  get selectedVehicleSignal(): Signal<Vehicle | null> {
    return this._selectedVehicleSignal;
  }

  synchronizeEnvironment(simulationEnvironment: AnimatedSimulationEnvironment) {
    this.selectedVehiclePolyline.clear();
    this.container.removeChildren();
    this.container.addChild(this.selectedVehiclePolyline);
    this.previousVehiclesEntities = this.vehicles;
    this.previousPassengerEntities = this.passengersEntities;
    this.vehicles = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];

    let isSelectedVehicleInEnvironment = false;

    this.startTimestamp = simulationEnvironment.animationData.startTimestamp;
    this.endTimestamp = simulationEnvironment.animationData.endTimestamp;

    for (const vehicle of Object.values(
      simulationEnvironment.animationData.vehicles,
    )) {
      if (vehicle.id == this._selectedVehicleSignal()?.id)
        isSelectedVehicleInEnvironment = true;
      this.addVehicle(vehicle);
    }

    if (this._selectedVehicleSignal() && !isSelectedVehicleInEnvironment) {
      this._selectedVehicleSignal.set(null);
      console.warn(
        'The vehicle you selected is not in the environment anymore. It has been deselected.',
      );
    }

    for (const passenger of Object.values(
      simulationEnvironment.animationData.passengers,
    )) {
      this.addPassenger(passenger);
    }

    this.previousVehiclesEntities = this.vehicles;
    this.previousPassengerEntities = this.passengersEntities;
  }

  synchronizeTime(
    simulationEnvironment: SimulationEnvironment,
    visualizationTime: number,
  ) {
    // Don't sync if we don't have the right state
    if (simulationEnvironment.timestamp != visualizationTime) {
      console.warn(
        "Animation not synced: simulation timestamp doesn't match visualisation time",
      );
      return;
    }

    if (
      this.startTimestamp === null ||
      this.endTimestamp === null ||
      visualizationTime < this.startTimestamp ||
      visualizationTime > this.endTimestamp
    ) {
      this.animationVisualizationTime = visualizationTime;
    }

    this.lastVisualisationTime = visualizationTime;
  }

  private addVehicle(vehicle: AnimatedVehicle, type = 'sample-bus') {
    const sprite = PIXI.Sprite.from(`images/${type}.png`) as EntityOwner<
      Entity<Vehicle>
    >;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(1 / this.utils.getScale());
    sprite.interactive = true;
    sprite.on('pointerdown', (e) => this.onEntityPointerdown(e));

    const entity: Entity<AnimatedVehicle> = {
      data: vehicle,
      sprite,
      requestedRotation: 0,
    };
    sprite.entity = entity;

    this.container.addChild(sprite);
    this.vehicles.push(entity);

    this.vehicleEntitiesByVehicleId[vehicle.id] = entity;
  }

  private addPassenger(passenger: AnimatedPassenger) {
    const sprite = PIXI.Sprite.from('images/sample-walk.png') as EntityOwner<
      Entity<Passenger>
    >;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(1 / this.utils.getScale());

    const entity: Entity<AnimatedPassenger> = {
      data: passenger,
      sprite,
      requestedRotation: 0,
    };
    sprite.entity = entity;

    this.container.addChild(sprite);
    this.passengersEntities.push(entity);
  }

  clearAnimations() {
    this.container.removeChildren();
    this.vehicles = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.selectedVehiclePolyline.clear();
    this._selectedVehicleSignal.set(null);
    this.previousVehiclesEntities = [];
    this.previousPassengerEntities = [];
  }

  setPause(pause: boolean) {
    this.pause = pause;
  }

  centerMap() {
    if (this.vehicles.length == 0) return;

    this.unselectVehicle();

    const allVehicleEntitiesY = this.previousVehiclesEntities
      .filter(
        (vehicle) =>
          vehicle.sprite.visible &&
          (vehicle.sprite.y != 0 || vehicle.sprite.x != 0),
      )
      .map((vehicle) => vehicle.sprite.y);
    const allVehicleEntitiesX = this.previousVehiclesEntities
      .filter(
        (vehicle) =>
          vehicle.sprite.visible &&
          (vehicle.sprite.y != 0 || vehicle.sprite.x != 0),
      )
      .map((vehicle) => vehicle.sprite.x);
    const allPassengerEntitiesY = this.previousPassengerEntities
      .filter(
        (passenger) =>
          passenger.sprite.visible &&
          (passenger.sprite.y != 0 || passenger.sprite.x != 0),
      )
      .map((passenger) => passenger.sprite.y);
    const allPassengerEntitiesX = this.previousPassengerEntities
      .filter(
        (passenger) =>
          passenger.sprite.visible &&
          (passenger.sprite.y != 0 || passenger.sprite.x != 0),
      )
      .map((passenger) => passenger.sprite.x);

    const allEntitiesY = allVehicleEntitiesY.concat(allPassengerEntitiesY);
    const allEntitiesX = allVehicleEntitiesX.concat(allPassengerEntitiesX);

    if (allEntitiesY.length == 0 || allEntitiesX.length == 0) {
      console.warn('No entities to center map on');
      return;
    }

    const minimumLatitude = Math.min(...allEntitiesY);
    const maximumLatitude = Math.max(...allEntitiesY);

    const minimumLongitude = Math.min(...allEntitiesX);
    const maximumLongitude = Math.max(...allEntitiesX);

    // Add some padding (at least 10% of the horizontal/vertical space)
    const padding = 0.1;

    const horizontalDistance = maximumLongitude - minimumLongitude;
    const verticalDistance = maximumLatitude - minimumLatitude;

    const southWest = this.utils.layerPointToLatLng(
      new L.Point(
        minimumLongitude - padding * horizontalDistance,
        minimumLatitude - padding * verticalDistance,
      ),
    );

    const northEast = this.utils.layerPointToLatLng(
      new L.Point(
        maximumLongitude + padding * horizontalDistance,
        maximumLatitude + padding * verticalDistance,
      ),
    );

    this.utils.getMap().flyToBounds(new L.LatLngBounds(southWest, northEast));
  }

  private setVehiclePositions() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicle = this.vehicles[index];

      const animationData = vehicle.data.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp >= this.animationVisualizationTime,
      );

      // Vehicle has no animation data
      // This can happen if the vehicle is not in the environment yet
      if (!animationData) {
        vehicle.sprite.visible = false;
        continue;
      }

      switch (animationData.status) {
        case 'alighting':
        case 'boarding':
        case 'idle':
        case 'release':
          vehicle.sprite.tint = this.LIGHT_BLUE;
          break;
        case 'complete':
          vehicle.sprite.tint = this.LIGHT_RED;
          break;
        case 'enroute':
          vehicle.sprite.tint = this.WHITE;
          break;
      }

      let polylineIndex: number | null = null;
      let lineIndex: number | null = null;
      let point: L.Point | null = null;
      if (
        (animationData as StaticVehicleAnimationData).position !== undefined
      ) {
        vehicle.sprite.visible = true;
        const staticVehicleAnimationData =
          animationData as StaticVehicleAnimationData;
        point = this.utils.latLngToLayerPoint([
          staticVehicleAnimationData.position.latitude,
          staticVehicleAnimationData.position.longitude,
        ]);
        vehicle.sprite.x = point.x;
        vehicle.sprite.y = point.y;
        polylineIndex = Math.max(staticVehicleAnimationData.polylineIndex, 0);
        lineIndex = staticVehicleAnimationData.polylineIndex === 0 ? 0 : -1;
      } else if (
        (animationData as DynamicVehicleAnimationData).polyline !== undefined
      ) {
        vehicle.sprite.visible = true;
        const dynamicVehicleAnimationData =
          animationData as DynamicVehicleAnimationData;
        const [lineNo, lineProgress] = this.getLineNoAndProgress(
          dynamicVehicleAnimationData.polyline,
          dynamicVehicleAnimationData.startTimestamp,
          dynamicVehicleAnimationData.endTimestamp,
        );
        point = this.applyInterpolation(
          vehicle,
          dynamicVehicleAnimationData.polyline,
          lineNo,
          lineProgress,
        );
        polylineIndex = dynamicVehicleAnimationData.polylineIndex;
        lineIndex = lineNo;
      } else {
        // Vehicle has an error
        vehicle.sprite.visible = false;
      }

      if (
        vehicle.sprite.visible &&
        this._selectedVehicleSignal()?.id == vehicle.data.id &&
        polylineIndex !== null &&
        lineIndex !== null &&
        point !== null
      ) {
        this.redrawPolyline(polylineIndex, lineIndex, point);
      }
    }
  }

  private setPassengerPositions() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.passengersEntities.length; ++index) {
      const passenger = this.passengersEntities[index];

      const animationData = passenger.data.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp >= this.animationVisualizationTime,
      );

      // Passenger has no animation data
      // This can happen if the passenger is not in the environment yet
      if (!animationData) {
        passenger.sprite.visible = false;
        continue;
      }

      switch (animationData.status) {
        case 'release':
          passenger.sprite.tint = '0xffff00'; // Yellow
          break;
        case 'assigned':
          passenger.sprite.tint = '0x0000ff'; // Blue
          break;
        case 'ready':
          passenger.sprite.tint = '0x00ff00'; // Green
          break;
        case 'onboard':
          passenger.sprite.tint = '0x00ffff'; // Cyan
          break;
        case 'complete':
          passenger.sprite.tint = '0xff00ff'; // Magenta
          break;
      }

      if (
        (animationData as StaticPassengerAnimationData).position !== undefined
      ) {
        passenger.sprite.visible = true;
        const staticVehicleAnimationData =
          animationData as StaticVehicleAnimationData;
        const point = this.utils.latLngToLayerPoint([
          staticVehicleAnimationData.position.latitude,
          staticVehicleAnimationData.position.longitude,
        ]);
        passenger.sprite.x = point.x;
        passenger.sprite.y = point.y;
      } else if (
        (animationData as DynamicPassengerAnimationData).vehicleId !== undefined
      ) {
        passenger.sprite.visible = true;
        const dynamicPassengerAnimationData =
          animationData as DynamicPassengerAnimationData;
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[
            dynamicPassengerAnimationData.vehicleId
          ];
        if (vehicleEntity) {
          passenger.sprite.visible = vehicleEntity.sprite.visible;
          passenger.sprite.x = vehicleEntity.sprite.x;
          passenger.sprite.y = vehicleEntity.sprite.y;
        }
      } else {
        // Passenger has an error
        passenger.sprite.visible = false;
      }
    }
  }

  private getLineNoAndProgress(
    polyline: Polyline,
    departureTime: number,
    arrivalTime: number,
  ) {
    const polylineProgress =
      (this.animationVisualizationTime - departureTime) /
      (arrivalTime - departureTime);

    const coefficients = polyline.coefficients;
    let lineProgress = 0;
    let cummulativeProgress = 0;
    let lineNo = 0;
    for (; lineNo < coefficients.length; ++lineNo) {
      const nextCummulativeProgress =
        cummulativeProgress + coefficients[lineNo];
      if (polylineProgress < nextCummulativeProgress) {
        lineProgress =
          (polylineProgress - cummulativeProgress) /
          (nextCummulativeProgress - cummulativeProgress);
        break;
      }
      cummulativeProgress = nextCummulativeProgress;
    }

    return [lineNo, lineProgress];
  }

  private applyInterpolation(
    vehicleEntity: Entity<Vehicle>,
    polyline: Polyline,
    lineNo: number,
    lineProgress: number,
  ) {
    let geoPosA = polyline.polyline[lineNo];
    let geoPosB = polyline.polyline[lineNo + 1];

    // If no next point, take previous point instead
    if (!geoPosB) {
      if (!geoPosA) return new L.Point(0, 0);
      geoPosB = geoPosA;
      geoPosA = polyline.polyline[lineNo - 1];

      // If no previous point, share same point
      if (!geoPosA) geoPosA = geoPosB;
      lineProgress = 1;
    }

    const pointA = this.utils.latLngToLayerPoint([
      geoPosA.latitude,
      geoPosA.longitude,
    ]);
    const pointB = this.utils.latLngToLayerPoint([
      geoPosB.latitude,
      geoPosB.longitude,
    ]);

    const interpolatedPosition = pointB
      .multiplyBy(lineProgress)
      .add(pointA.multiplyBy(1 - lineProgress));

    vehicleEntity.sprite.x = interpolatedPosition.x;
    vehicleEntity.sprite.y = interpolatedPosition.y;

    // Set orientation
    const direction = pointB.subtract(pointA);
    const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
    vehicleEntity.sprite.rotation = angle;

    return interpolatedPosition;
  }

  private redrawPolyline(
    polylineNo: number,
    lineNo: number,
    interpolatedPoint: L.Point,
  ) {
    const selectedVehicle = this._selectedVehicleSignal();
    if (!selectedVehicle) return;

    const BASE_LINE_WIDTH = 4;
    const MIN_WIDTH = 0.04; // By testing out values
    const ALPHA = 0.9;

    const width = Math.max(BASE_LINE_WIDTH / this.utils?.getScale(), MIN_WIDTH);

    const graphics = this.selectedVehiclePolyline;
    graphics.clear();
    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

    const polylines = Object.values(selectedVehicle.polylines ?? {});
    if (polylines.length == 0) return;

    const polyline = polylines[0].polyline;
    if (polyline.length == 0) return;

    const geoPos = polyline[0];
    const point = this.utils.latLngToLayerPoint([
      geoPos.latitude,
      geoPos.longitude,
    ]);
    graphics.moveTo(point.x, point.y);

    // Draw all poylines before the polylineNo
    for (let i = 0; i < polylineNo; ++i) {
      const polyline = polylines[i];
      for (let j = 1; j < polyline.polyline.length; ++j) {
        const geoPos = polyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([
          geoPos.latitude,
          geoPos.longitude,
        ]);
        graphics.lineTo(point.x, point.y);
      }
    }

    // Draw all the lines of polylineNo but before lineNo
    const currentPolyline = polylines[polylineNo];
    for (let j = 1; j <= lineNo; ++j) {
      const geoPos = currentPolyline.polyline[j];
      const point = this.utils.latLngToLayerPoint([
        geoPos.latitude,
        geoPos.longitude,
      ]);
      graphics.lineTo(point.x, point.y);
    }

    // Draw line until interpolated point
    graphics.lineTo(interpolatedPoint.x, interpolatedPoint.y);

    // Change color
    graphics.lineStyle(width, this.LIGHT_GRAY, ALPHA);

    // Draw rest of lines of polylineNo
    for (let j = lineNo + 1; j < currentPolyline.polyline.length; ++j) {
      const geoPos = currentPolyline.polyline[j];
      const point = this.utils.latLngToLayerPoint([
        geoPos.latitude,
        geoPos.longitude,
      ]);
      graphics.lineTo(point.x, point.y);
    }

    // Draw rest of polylines
    for (let i = polylineNo + 1; i < polylines.length; ++i) {
      const polyline = polylines[i];
      for (let j = 1; j < polyline.polyline.length; ++j) {
        const geoPos = polyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([
          geoPos.latitude,
          geoPos.longitude,
        ]);
        graphics.lineTo(point.x, point.y);
      }
    }

    // Draw stops that are completed
    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);
    for (let i = 0; i < polylineNo; ++i) {
      const polyline = polylines[i];
      const geoPos = polyline.polyline[polyline.polyline.length - 1];
      const point = this.utils.latLngToLayerPoint([
        geoPos.latitude,
        geoPos.longitude,
      ]);
      graphics.beginFill(this.WHITE, 1);
      graphics.drawCircle(point.x, point.y, width * 1.2);
      graphics.endFill();
    }

    // Draw stops that are not completed
    graphics.lineStyle(width, this.LIGHT_GRAY, ALPHA);
    for (let i = polylineNo; i < polylines.length - 1; ++i) {
      const polyline = polylines[i];
      const geoPos = polyline.polyline[polyline.polyline.length - 1];
      const point = this.utils.latLngToLayerPoint([
        geoPos.latitude,
        geoPos.longitude,
      ]);
      graphics.beginFill(this.WHITE, 1);
      graphics.drawCircle(point.x, point.y, width * 1.2);
      graphics.endFill();
    }
  }

  private updateAnimationTime() {
    const deltaSec = (this.speed * this.ticker.deltaMS) / 1000;
    if (!this.pause) {
      this.animationVisualizationTime += deltaSec;
      this.lastVisualisationTime += deltaSec;
    }

    const desyncDiff =
      this.lastVisualisationTime - this.animationVisualizationTime;
    const absDesyncDiff = Math.abs(desyncDiff);
    if (absDesyncDiff > this.MIN_LERPABLE_DESYNC_DIFF * this.speed) {
      this.animationVisualizationTime +=
        desyncDiff * (1 - Math.exp(-5 * deltaSec));
    }
  }

  // Called once when Pixi layer is added.
  private onAdd(utils: L.PixiOverlayUtils) {
    this.lastScale = utils.getScale();
  }

  private onMoveEnd(event: L.LeafletEvent) {
    const scale = this.utils.getScale();
    if (scale != this.lastScale) this.onZoomEnd(event);
    this.lastScale = scale;
  }

  private onZoomEnd(event: L.LeafletEvent) {
    const invScale = 1 / this.utils.getScale();
    this.vehicles.forEach((entity) => {
      entity.sprite.scale.set(invScale);
    });
    this.passengersEntities.forEach((entity) => {
      entity.sprite.scale.set(invScale);
    });
  }

  private onRedraw(event: L.LeafletEvent) {
    if (this.startTimestamp == null || this.endTimestamp == null) return;

    if (
      this.animationVisualizationTime < this.startTimestamp ||
      this.animationVisualizationTime > this.endTimestamp
    ) {
      return;
    }

    this.updateAnimationTime();

    this.setVehiclePositions();
    this.setPassengerPositions();
  }

  // onClick is called after onEntityPointerdown
  private onClick(event: L.LeafletMouseEvent) {
    if (!this.frame_onEntityPointerDownCalled) {
      this.unselectVehicle();
    }
    this.frame_onEntityPointerDownCalled = false;
  }

  private onEntityPointerdown(event: PIXI.FederatedPointerEvent) {
    const sprite = event.target as EntityOwner<Entity<Vehicle>>;
    if (!sprite) return;

    const entity = sprite.entity;
    if (!entity) return;

    this.selectVehicle(entity.data);
    this.frame_onEntityPointerDownCalled = true;
  }

  private selectVehicle(vehicle: Vehicle) {
    this._selectedVehicleSignal.set(vehicle);
  }

  private unselectVehicle() {
    this._selectedVehicleSignal.set(null);
    this.selectedVehiclePolyline.clear();
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

    this.ticker.add((delta) => {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as L.LeafletEvent);

      if (this.frame_pointToFollow)
        this.utils.getMap().setView(this.frame_pointToFollow);
      this.frame_pointToFollow = null;
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

  setSpeed(speed: number) {
    this.speed = speed;
  }
}

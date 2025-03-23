import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import * as L from 'leaflet';
import { pixiOverlay } from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { Entity, EntityOwner } from '../interfaces/entity.model';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedVehicle,
  DynamicVehicleAnimationData,
  Passenger,
  Polyline,
  Polylines,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  Vehicle,
} from '../interfaces/simulation.model';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  private readonly _selectedVehicleIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _selectedPassengerIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _clickPositionSignal: WritableSignal<PIXI.Point> = signal(
    new PIXI.Point(0, 0),
  );

  private readonly _nearVehiclesSignal: WritableSignal<string[]> = signal([]);
  private readonly _nearPassengersSignal: WritableSignal<string[]> = signal([]);

  get nearVehiclesSignal(): Signal<string[]> {
    return this._nearVehiclesSignal;
  }

  get nearPassengersSignal(): Signal<string[]> {
    return this._nearPassengersSignal;
  }

  get selectedVehicleIdSignal(): Signal<string | null> {
    return this._selectedVehicleIdSignal;
  }

  get selectedPassengerIdSignal(): Signal<string | null> {
    return this._selectedPassengerIdSignal;
  }

  get clickPositionSignal(): Signal<PIXI.Point> {
    return this._clickPositionSignal;
  }

  readonly hasSelectedEntitySignal: Signal<boolean> = computed(
    () =>
      this._selectedVehicleIdSignal() !== null ||
      this._selectedPassengerIdSignal() !== null,
  );

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
  private passengerEntitiesByPassengerId: Record<
    string,
    Entity<AnimatedPassenger>
  > = {};
  private container = new PIXI.Container();

  private startTimestamp: number | null = null;
  private endTimestamp: number | null = null;

  private lastScale = 0;
  private utils!: L.PixiOverlayUtils;

  private selectedEntityPolyline: PIXI.Graphics = new PIXI.Graphics();

  // Variable that are alive for a single frame (could probably improve)
  private frame_pointToFollow: L.LatLngExpression | null = null;

  private previousVehiclesEntities: Entity<AnimatedVehicle>[] = [];
  private previousPassengerEntities: Entity<AnimatedPassenger>[] = [];

  private speed = 1;
  private readonly _shouldFollowEntitySignal: WritableSignal<boolean> =
    signal(false);

  get shouldFollowEntitySignal(): Signal<boolean> {
    return this._shouldFollowEntitySignal;
  }

  synchronizeEnvironment(simulationEnvironment: AnimatedSimulationEnvironment) {
    this.selectedEntityPolyline.clear();
    this.container.removeChildren();
    this.container.addChild(this.selectedEntityPolyline);
    this.previousVehiclesEntities = this.vehicles;
    this.previousPassengerEntities = this.passengersEntities;
    this.vehicles = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.passengerEntitiesByPassengerId = {};

    let isSelectedVehicleInEnvironment = false;

    this.startTimestamp = simulationEnvironment.animationData.startTimestamp;
    this.endTimestamp = simulationEnvironment.animationData.endTimestamp;

    const selectedVehicleId = this._selectedVehicleIdSignal();
    const selectedPassengerId = this._selectedPassengerIdSignal();

    for (const vehicle of Object.values(
      simulationEnvironment.animationData.vehicles,
    )) {
      this.addVehicle(vehicle);
      if (selectedVehicleId !== null && vehicle.id == selectedVehicleId) {
        isSelectedVehicleInEnvironment = true;
      }
    }

    if (selectedVehicleId !== null && !isSelectedVehicleInEnvironment) {
      this.unselectVehicle();
      console.warn(
        'The vehicle you selected is not in the environment anymore. It has been deselected.',
      );
    }

    let isSelectedPassengerInEnvironment = false;

    for (const passenger of Object.values(
      simulationEnvironment.animationData.passengers,
    )) {
      this.addPassenger(passenger);
      if (selectedPassengerId !== null && passenger.id == selectedPassengerId) {
        isSelectedPassengerInEnvironment = true;
      }
    }

    if (selectedPassengerId !== null && !isSelectedPassengerInEnvironment) {
      this.unselectPassenger();
      console.warn(
        'The passenger you selected is not in the environment anymore. It has been deselected.',
      );
    }

    this.previousVehiclesEntities = this.vehicles;
    this.previousPassengerEntities = this.passengersEntities;
  }

  synchronizeTime(
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    visualizationTime: number,
  ) {
    // Don't sync if we don't have the right state
    if (animatedSimulationEnvironment.timestamp != visualizationTime) {
      console.warn(
        "Animation not synced: simulation timestamp doesn't match visualisation time",
      );
      return;
    }

    if (
      this.startTimestamp === null ||
      this.endTimestamp === null ||
      this.animationVisualizationTime < this.startTimestamp ||
      this.animationVisualizationTime > this.endTimestamp ||
      this.pause
    ) {
      this.animationVisualizationTime = visualizationTime;
    }

    this.lastVisualisationTime = visualizationTime;
  }

  private addVehicle(vehicle: AnimatedVehicle, type = 'sample-bus'): void {
    const sprite = PIXI.Sprite.from(`images/${type}.png`) as EntityOwner<
      Entity<Vehicle>
    >;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(1 / this.utils.getScale());

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

  private addPassenger(passenger: AnimatedPassenger): void {
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

    this.passengerEntitiesByPassengerId[passenger.id] = entity;
  }

  clearAnimations() {
    this.container.removeChildren();
    this.vehicles = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.passengerEntitiesByPassengerId = {};
    this.unselectEntity();
    this.removePolylines();
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
      if (animationData.notDisplayedReason !== null) {
        // Vehicle has an error
        vehicle.sprite.visible = false;
      } else if (
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
        lineIndex =
          staticVehicleAnimationData.polylineIndex === -1
            ? 0
            : (vehicle.data.polylines?.[
                staticVehicleAnimationData.polylineIndex
              ]?.polyline.length ?? 0) - 1;
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
        // Vehicle has an unknown error
        vehicle.sprite.visible = false;
      }

      const selectedVehicleId = this._selectedVehicleIdSignal();
      if (
        vehicle.sprite.visible &&
        selectedVehicleId !== null &&
        selectedVehicleId === vehicle.data.id &&
        polylineIndex !== null &&
        lineIndex !== null &&
        point !== null
      ) {
        this.frame_pointToFollow = this.utils.layerPointToLatLng(point);
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

      if (animationData.notDisplayedReason !== null) {
        // Passenger has an error
        passenger.sprite.visible = false;
      } else if (
        (animationData as StaticPassengerAnimationData).position !== undefined
      ) {
        passenger.sprite.visible = true;
        const staticPassengerAnimationData =
          animationData as StaticPassengerAnimationData;
        const point = this.utils.latLngToLayerPoint([
          staticPassengerAnimationData.position.latitude,
          staticPassengerAnimationData.position.longitude,
        ]);
        passenger.sprite.x = point.x;
        passenger.sprite.y = point.y;
      } else if (animationData.vehicleId !== null) {
        passenger.sprite.visible = true;
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[animationData.vehicleId];
        if (vehicleEntity) {
          passenger.sprite.visible = vehicleEntity.sprite.visible;
          passenger.sprite.x = vehicleEntity.sprite.x;
          passenger.sprite.y = vehicleEntity.sprite.y;
        }
      } else {
        // Passenger has an unknown error
        passenger.sprite.visible = false;
      }

      const selectedPassengerId = this._selectedPassengerIdSignal();
      if (
        passenger.sprite.visible &&
        selectedPassengerId !== null &&
        selectedPassengerId === passenger.data.id
      ) {
        this.frame_pointToFollow = this.utils.layerPointToLatLng(
          new L.Point(passenger.sprite.x, passenger.sprite.y),
        );
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

  private findVisuallyNearEntities(event: L.LeafletMouseEvent) {
    // 20 comes from half the size of the images in pixels
    const minVisualDistance = 20 / this.utils.getScale();
    const point = this.utils.latLngToLayerPoint(event.latlng);

    const nearVehicles = [];
    const nearPassengers = [];

    // Distances for all vehicles
    for (const vehicle of this.vehicles) {
      const distance = this.distanceBetweenPoints(
        point,
        vehicle.sprite.position,
      );
      if (distance <= minVisualDistance) nearVehicles.push(vehicle.data.id);
    }

    // Distances for all passengers
    for (const passenger of this.passengersEntities) {
      const distance = this.distanceBetweenPoints(
        point,
        passenger.sprite.position,
      );
      if (distance <= minVisualDistance) nearPassengers.push(passenger.data.id);
    }

    // No entities
    if (nearVehicles.length + nearPassengers.length === 0) {
      this.unselectEntity();
    }
    // One vehicle
    else if (nearVehicles.length === 1 && nearPassengers.length === 0) {
      this.selectVehicle(nearVehicles[0]);
    }
    // One passenger
    else if (nearVehicles.length === 0 && nearPassengers.length === 1) {
      this.selectPassenger(nearPassengers[0]);
    }
    // More than one
    else {
      this._clickPositionSignal.set(
        new PIXI.Point(event.containerPoint.x, event.containerPoint.y),
      );
      this._nearVehiclesSignal.set(nearVehicles);
      this._nearPassengersSignal.set(nearPassengers);
    }
  }

  private distanceBetweenPoints(
    pointA: { x: number; y: number },
    pointB: { x: number; y: number },
  ) {
    const dx = pointA.x - pointB.x;
    const dy = pointA.y - pointB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private redrawPolyline(
    polylineNo: number,
    lineNo: number,
    interpolatedPoint: L.Point,
  ) {
    const selectedVehicleId = this._selectedVehicleIdSignal();
    if (selectedVehicleId === null) return;

    const selectedVehicle = this.vehicleEntitiesByVehicleId[selectedVehicleId];
    if (selectedVehicle === undefined) return;

    const BASE_LINE_WIDTH = 4;
    const MIN_WIDTH = 0.04; // By testing out values
    const ALPHA = 0.9;

    const width = Math.max(BASE_LINE_WIDTH / this.utils?.getScale(), MIN_WIDTH);

    const graphics = this.selectedEntityPolyline;
    graphics.clear();
    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

    const polylines = Object.values(selectedVehicle.data.polylines ?? {});
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
    const deltaSec = this.ticker.deltaMS / 1000;
    if (!this.pause) {
      this.animationVisualizationTime += deltaSec * this.speed;
      this.lastVisualisationTime += deltaSec * this.speed;
    }

    const desyncDiff =
      this.lastVisualisationTime - this.animationVisualizationTime;
    if (Math.abs(desyncDiff) > this.MIN_LERPABLE_DESYNC_DIFF * this.speed) {
      this.animationVisualizationTime +=
        desyncDiff * (1 - Math.exp(-5 * Math.abs(deltaSec)));
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

    if (this.pause) {
      this.animationVisualizationTime = this.lastVisualisationTime;
    } else {
      this.updateAnimationTime();
    }

    if (this.animationVisualizationTime < this.startTimestamp) {
      this.animationVisualizationTime = this.startTimestamp;
    }

    if (this.animationVisualizationTime > this.endTimestamp) {
      this.animationVisualizationTime = this.endTimestamp;
    }

    this.setVehiclePositions();
    this.setPassengerPositions();
  }

  // onClick is called after onEntityPointerdown
  private onClick(event: L.LeafletMouseEvent) {
    this.findVisuallyNearEntities(event);
  }

  private selectVehicle(vehicleId: string) {
    this.unselectPassenger();
    this._selectedVehicleIdSignal.set(vehicleId);
  }

  private selectPassenger(passengerId: string) {
    this.unselectVehicle();
    this._selectedPassengerIdSignal.set(passengerId);
  }

  private unselectVehicle() {
    this._selectedVehicleIdSignal.set(null);
    this.selectedEntityPolyline.clear();
  }

  private unselectPassenger() {
    this._selectedPassengerIdSignal.set(null);
    this.selectedEntityPolyline.clear();
  }

  selectEntity(entityId: string, type: 'vehicle' | 'passenger') {
    if (type == 'vehicle') {
      this.selectVehicle(entityId);
    } else if (type == 'passenger') {
      this.selectPassenger(entityId);
    }
  }

  unselectEntity() {
    this.unselectVehicle();
    this.unselectPassenger();
  }

  addPixiOverlay(map: L.Map) {
    map.on('click', (event) => {
      this.onClick(event);
    });
    const pixiLayer = (() => {
      return pixiOverlay(
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

      if (this.frame_pointToFollow && this._shouldFollowEntitySignal())
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

  toggleShouldFollowEntity() {
    this._shouldFollowEntitySignal.update(
      (shouldFollowEntity) => !shouldFollowEntity,
    );
  }
}

import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { EntityOwner, VehicleEntity } from '../interfaces/entity.model';
import {
  SimulationEnvironment,
  Stop,
  Vehicle,
} from '../interfaces/simulation.model';
import { Polyline, Polylines } from '../interfaces/simulation.model';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  private readonly MIN_LERPABLE_DESYNC_DIFF = 1.5;
  private readonly MAX_LERPABLE_DESYNC_DIFF = 900;

  private readonly WHITE = 0xffffff;
  private readonly LIGHT_RED = 0xffcdcd;
  private readonly LIGHT_BLUE = 0xcdcdff;
  private readonly SATURATED_RED = 0xcd2222;
  private readonly KELLY_GREEN = 0x028a0f;
  private readonly DESATURATED_BLUE = 0x666666;

  private pause = false;
  private animationVisualizationTime = 0;
  private lastVisualisationTime = 0;

  private ticker: PIXI.Ticker = new PIXI.Ticker();
  private vehicles: VehicleEntity[] = [];
  private container = new PIXI.Container();

  private lastScale = 0;
  private utils!: L.PixiOverlayUtils;

  private selectedVehicle: Vehicle | null = null;
  private selectedVehiclePolyline: PIXI.Graphics = new PIXI.Graphics();

  // Variable that are alive for a single frame (could probably improve)
  private frame_onEntityPointerDownCalled = false;
  private frame_pointToFollow: L.LatLngExpression | null = null;

  synchronizeEnvironment(simulationEnvironment: SimulationEnvironment) {
    console.log('[Simulation Environment]', simulationEnvironment);

    this.container.removeChildren();
    this.container.addChild(this.selectedVehiclePolyline);
    this.vehicles = [];

    let isSelectedVehicleInEnvironment = false;

    for (const vehicle of Object.values(simulationEnvironment.vehicles)) {
      if (vehicle.id == this.selectedVehicle?.id)
        isSelectedVehicleInEnvironment = true;
      this.addVehicle(vehicle);
    }

    if (this.selectedVehicle && !isSelectedVehicleInEnvironment) {
      this.selectedVehicle = null;
      this.selectedVehiclePolyline.clear();
      console.warn(
        'The vehicle you selected is not in the environment anymore. It has been deselected.',
      );
    }
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

    const timeDifference = this.animationVisualizationTime - visualizationTime;
    if (Math.abs(timeDifference) > this.MAX_LERPABLE_DESYNC_DIFF) {
      this.animationVisualizationTime = visualizationTime;
    }

    this.lastVisualisationTime = visualizationTime;
  }

  addVehicle(vehicle: Vehicle, type = 'sample-bus') {
    if (!vehicle.polylines) {
      // console.error('Vehicle has no polyline.', vehicle);
      return;
    }

    if (!vehicle.polylines[0]) {
      // console.error('Vehicle has a polyline object but is empty.', vehicle);
      return;
    }

    if (vehicle.polylines[0].polyline.length == 0) {
      // console.error('Vehicle has one polyline but has no lines.', vehicle);
      return;
    }

    const sprite = PIXI.Sprite.from(`images/${type}.png`) as EntityOwner;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(1 / this.utils.getScale());
    sprite.interactive = true;
    sprite.on('pointerdown', (e) => this.onEntityPointerdown(e));

    const entity: VehicleEntity = {
      data: vehicle,
      sprite,
      requestedRotation: 0,
    };
    sprite.entity = entity;

    this.container.addChild(sprite);
    this.vehicles.push(entity);
  }

  clearAnimations() {
    this.container.removeChildren();
    this.vehicles = [];
  }

  setPause(pause: boolean) {
    this.pause = pause;
  }

  private setVehiclePositions() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicle = this.vehicles[index];

      if (vehicle.data.polylines == null) {
        console.error(`Vehicle ${vehicle.data.id} has no polyline.`);
        continue;
      }

      let polylineNo = -1;
      let polyline = undefined;
      let lineNo = -1;
      let lineProgress = -1;

      // Vehicle has current stop
      if (vehicle.data.currentStop) {
        polylineNo = vehicle.data.previousStops.length;
        polyline = vehicle.data.polylines[polylineNo];
        lineNo = 0;
        lineProgress = 0;

        if (polyline == null) {
          polyline =
            vehicle.data.polylines[
              Object.values(vehicle.data.polylines).length - 1
            ]; // Get last polyline
        }

        if (vehicle.data.status == 'complete')
          vehicle.sprite.tint = this.LIGHT_RED;
        else if (vehicle.data.status == 'idle')
          vehicle.sprite.tint = this.LIGHT_BLUE;
        else vehicle.sprite.tint = this.SATURATED_RED;
      }
      // Vehicle is (theorhetically) enroute
      else {
        polylineNo = vehicle.data.previousStops.length - 1;

        const departureTime =
          vehicle.data.previousStops[polylineNo].departureTime ?? 0;
        const arrivalTime = vehicle.data.nextStops[0].arrivalTime;

        polyline = vehicle.data.polylines[polylineNo];
        if (!polyline) {
          console.error(
            'Could not correctly get polyline.',
            polylineNo,
            vehicle.data,
          );
          continue;
        }

        [lineNo, lineProgress] = this.getLineNoAndProgress(
          polyline,
          departureTime,
          arrivalTime,
        );
        lineProgress = Math.max(0, lineProgress);
        lineProgress = Math.min(lineProgress, 1);
      }

      this.applyInterpolation(
        vehicle,
        polyline,
        polylineNo,
        lineNo,
        lineProgress,
      );
    }
  }

  private setVehiclePositionsV2() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicle = this.vehicles[index];

      if (vehicle.data.polylines == null) {
        console.error(
          `Vehicle ${vehicle.data.id} has no polyline.`,
          vehicle.data,
        );
        continue;
      }

      const polylines = Object.values(vehicle.data.polylines);

      const allStops = vehicle.data.currentStop
        ? [
            ...vehicle.data.previousStops,
            vehicle.data.currentStop,
            ...vehicle.data.nextStops,
          ]
        : [...vehicle.data.previousStops, ...vehicle.data.nextStops];

      // eslint-disable-next-line prefer-const
      let [polylineNo, departureTime, arrivalTime, isWaiting] =
        this.getPolylineNoAndStatus(allStops);
      const reachedEnd = polylineNo >= polylines.length;

      polylineNo = Math.min(polylineNo, polylines.length - 1);

      const polyline = polylines[polylineNo];

      let lineNo = reachedEnd ? polyline.polyline.length - 1 : 0;
      let lineProgress = reachedEnd ? 1 : 0;
      if (isWaiting) {
        if (vehicle.data.status == 'complete')
          vehicle.sprite.tint = this.LIGHT_RED;
        else vehicle.sprite.tint = this.LIGHT_BLUE;
      } else {
        vehicle.sprite.tint = this.WHITE;
        [lineNo, lineProgress] = this.getLineNoAndProgress(
          polyline,
          departureTime,
          arrivalTime,
        );
      }

      const interpolatedPosition = this.applyInterpolation(
        vehicle,
        polyline,
        polylineNo,
        lineNo,
        lineProgress,
      );

      if (this.selectedVehicle?.id == vehicle.data.id) {
        this.frame_pointToFollow =
          this.utils.layerPointToLatLng(interpolatedPosition);
        this.redrawPolyline(polylineNo, lineNo, interpolatedPosition);
      }
    }
  }

  private getPolylineNoAndStatus(
    stops: Stop[],
  ): [number, number, number, boolean] {
    let arrivalTime = -1;
    let departureTime = -1;
    let isWaiting = false;

    let polylineNo = 0;
    for (; polylineNo < stops.length; ++polylineNo) {
      const stop = stops[polylineNo];
      if (stop == null) continue;

      arrivalTime = stop.arrivalTime;

      if (this.animationVisualizationTime < stop.arrivalTime) {
        isWaiting = false;
        break;
      }

      if (
        stop.departureTime == null ||
        this.animationVisualizationTime < stop.departureTime
      ) {
        isWaiting = true;
        break;
      }

      departureTime = stop.departureTime;
    }

    if (departureTime === -1) isWaiting = true; // Not even at the first stop
    if (departureTime >= arrivalTime) isWaiting = true; // Went through all his stops
    if (!isWaiting) polylineNo -= 1;

    return [polylineNo, departureTime, arrivalTime, isWaiting];
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
    vehicleEntity: VehicleEntity,
    polyline: Polyline,
    polylineNo: number,
    lineNo: number,
    lineProgress: number,
  ) {
    let geoPosA = polyline.polyline[lineNo];
    let geoPosB = polyline.polyline[lineNo + 1];

    // If no next point, take previous point instead
    if (!geoPosB) {
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
    const BASE_LINE_WIDTH = 4;
    const MIN_WIDTH = 0.04; // By testing out values
    const ALPHA = 0.9;

    const width = Math.max(BASE_LINE_WIDTH / this.utils?.getScale(), MIN_WIDTH);

    const graphics = this.selectedVehiclePolyline;
    graphics.clear();
    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

    const polylines = Object.values(this.selectedVehicle?.polylines ?? {});
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
    graphics.lineStyle(width, this.DESATURED_BLUE, ALPHA);

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
    graphics.lineStyle(width, this.DESATURED_BLUE, ALPHA);
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
    this.animationVisualizationTime += deltaSec;
    this.lastVisualisationTime += deltaSec;

    const desyncDiff =
      this.lastVisualisationTime - this.animationVisualizationTime;
    const absDesyncDiff = Math.abs(desyncDiff);
    if (
      absDesyncDiff > this.MIN_LERPABLE_DESYNC_DIFF &&
      absDesyncDiff < this.MAX_LERPABLE_DESYNC_DIFF
    ) {
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
  }

  private onRedraw(event: L.LeafletEvent) {
    if (!this.pause) this.updateAnimationTime();
    this.setVehiclePositionsV2();
  }

  // onClick is called after onEntityPointerdown
  private onClick(event: L.LeafletMouseEvent) {
    if (!this.frame_onEntityPointerDownCalled) {
      this.selectedVehicle = null;
      this.selectedVehiclePolyline.clear();
    }
    this.frame_onEntityPointerDownCalled = false;
  }

  private onEntityPointerdown(event: PIXI.FederatedPointerEvent) {
    const sprite = event.target as EntityOwner;
    if (!sprite) return;

    const entity = sprite.entity;
    if (!entity) return;

    this.selectedVehicle = entity.data;
    this.frame_onEntityPointerDownCalled = true;
    console.log('Vehicle selected:', this.selectedVehicle);
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
}

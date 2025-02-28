import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { EntityOwner, VehicleEntity } from '../interfaces/entity.model';
import { SimulationEnvironment, Stop, Vehicle } from '../interfaces/simulation.model';
import { Polyline, Polylines } from '../interfaces/simulation.model';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  private readonly MIN_LERPABLE_DESYNC_DIFF = 1.5;
  private readonly MAX_LERPABLE_DESYNC_DIFF = 900;

  private readonly LIGHT_RED = 0xFFCDCD;
  private readonly LIGHT_BLUE = 0xCDCDFF;
  private readonly SATURATED_RED = 0xCD2222;
  private readonly KELLY_GREEN = 0x4CBB17;
  private readonly DESATURED_BLUE = 0x8F6F8F;

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

  synchronizeEnvironment(simulationEnvironment: SimulationEnvironment) {
    console.log('Simulation env: ', simulationEnvironment);

    this.container.removeChildren();
    this.container.addChild(this.selectedVehiclePolyline);
    this.vehicles = [];

    let isSelectedVehicleInEnvironment = false;

    for (const vehicle of Object.values(simulationEnvironment.vehicles)) {
      if (vehicle.id == this.selectedVehicle?.id)  {
        isSelectedVehicleInEnvironment = true;
        this.selectedVehicle = vehicle; // Update the data
      }
      this.addVehicle(vehicle);
    }

    if (this.selectedVehicle && !isSelectedVehicleInEnvironment)  {
      this.selectedVehicle = null;
      this.selectedVehiclePolyline.clear();
      console.warn('The vehicle you selected is not in the environment anymore. It has been deselected.');
    }
  }

  synchronizeTime(simulationEnvironment: SimulationEnvironment, visualizationTime: number) {
    // Don't sync if we don't have the right state
    if (simulationEnvironment.timestamp != visualizationTime) {
      console.warn('Animation not synced since simulation timestamp doesn\'t match visualisation time');
      return;
    };

    console.log('[anim]', this.animationVisualizationTime.toFixed(2), '[simu]', visualizationTime);
    
    const timeDifference = this.animationVisualizationTime - visualizationTime;
    if (Math.abs(timeDifference) > this.MAX_LERPABLE_DESYNC_DIFF)  {
      console.log('syncthime time because difference is ', timeDifference)
      this.animationVisualizationTime = visualizationTime;
    }

    this.lastVisualisationTime = visualizationTime;
  }

  addVehicle(vehicle: Vehicle, type = 'sample-bus') {
    if (!vehicle.polylines)  {
      //if (vehicle.id == this.selectedVehicle?.id) console.error('the vehicle you watched has no more poylines', vehicle);
      //console.error('vehicle has no polyline', vehicle);
      return;
    };

    if (!vehicle.polylines[0])  {
      //if (vehicle.id == this.selectedVehicle?.id) console.error('the vehicle you watched poyline obj but is empty', vehicle);
      //console.error('vehicle poyline obj but is empty', vehicle);
      return;
    }

    if (vehicle.polylines[0].polyline.length == 0) {
      //if (vehicle.id == this.selectedVehicle?.id) console.error('the vehicle you watched has one polyline but has no lines', vehicle);
      // console.error('vehicle has one polyline but has no lines', vehicle);
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

      if (vehicle.data.polylines == null)  {
        console.error(`vehicle ${vehicle.data.id} has no polyline`);
        continue;
      };

      let polylineNo = -1;
      let polyline = undefined;
      let lineNo = -1;
      let lineProgress = -1;

      // Vehicle has current stop
      if (vehicle.data.currentStop) {
        polylineNo = vehicle.data.previousStops.length
        polyline = vehicle.data.polylines[polylineNo];
        lineNo = 0;
        lineProgress = 0;

        if (polyline == null) {
          polylineNo = Object.values(vehicle.data.polylines).length -1;
          polyline = vehicle.data.polylines[polylineNo]; // Get last polyline
        }

        if (vehicle.data.status == 'complete') vehicle.sprite.tint = this.LIGHT_RED;
        else if (vehicle.data.status == 'idle') vehicle.sprite.tint = this.LIGHT_BLUE;
        else vehicle.sprite.tint = this.SATURATED_RED;

      }
      // Vehicle is (theorhetically) enroute
      else {
        polylineNo = vehicle.data.previousStops.length -1;

        const departureTime = vehicle.data.previousStops[polylineNo].departureTime ?? 0;
        const arrivalTime = vehicle.data.nextStops[0].arrivalTime;
        if (departureTime >= arrivalTime) {
          console.log('Something went wrong. departureTime >= arrivalTime...', vehicle)
          continue;
        };

        polyline = vehicle.data.polylines[polylineNo];
        if (!polyline) {
          console.error('no polyline', polylineNo, vehicle.data);
          continue;
        }

        [lineNo, lineProgress] = this.getLineNoAndProgress(polyline, departureTime, arrivalTime);

        // Log progress if vehicle is selected
        if (vehicle.data.id == this.selectedVehicle?.id) {
          console.log('[polylineProgress]', vehicle.data.id, '[polylineNo]', polylineNo, '[noLine]', lineNo);
        }
      }

      this.applyInterpolation(vehicle, polyline, polylineNo, lineNo, lineProgress);
    }    
  }

  private setVehiclePositionsV2() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicle = this.vehicles[index];

      if (vehicle.data.polylines == null)  {
        console.error(`Vehicle ${vehicle.data.id} has no polyline.`, vehicle.data);
        continue;
      };

      const polylines = Object.values(vehicle.data.polylines);

      const allStops = vehicle.data.currentStop ? 
      [...vehicle.data.previousStops, vehicle.data.currentStop, ...vehicle.data.nextStops] :
      [...vehicle.data.previousStops, ...vehicle.data.nextStops];

      // eslint-disable-next-line prefer-const
      let [polylineNo, departureTime, arrivalTime, isWaiting] = this.getPolylineNoAndStatus(allStops);
      const reachedEnd = polylineNo >= polylines.length;

      polylineNo = Math.min(polylineNo, polylines.length -1);
      
      const polyline = polylines[Math.min(polylineNo, polylines.length -1)];
      if (!polyline) console.error('no polyline', polylineNo, isWaiting, vehicle.data);

      let lineNo = reachedEnd ? polyline.polyline.length -1 : 0;
      let lineProgress = reachedEnd ? 1 : 0;
      if (!isWaiting) [lineNo, lineProgress] = this.getLineNoAndProgress(polyline, departureTime, arrivalTime);
      else if (vehicle.data.status == 'complete') vehicle.sprite.tint = this.LIGHT_RED;
      else vehicle.sprite.tint = this.LIGHT_BLUE;

      this.applyInterpolation(vehicle, polyline, polylineNo, lineNo, lineProgress)
    }    
  }

  private getPolylineNoAndStatus(stops: Stop[]) : [number, number, number, boolean] {
    let arrivalTime = -1;
    let departureTime = -1;
    let isWaiting = false;

    let polylineNo = 0;
    for (; polylineNo < stops.length; ++polylineNo) {
      const stop = stops[polylineNo];
      if (stop == null || stop.departureTime == null) continue;

      arrivalTime = stop.arrivalTime;

      if (this.animationVisualizationTime < stop.arrivalTime) {
        isWaiting = false;
        break;
      }

      if (this.animationVisualizationTime < stop.departureTime ) {
        isWaiting = true;
        break;
      };

      departureTime = stop.departureTime;
    }

    if (departureTime === -1) isWaiting = true; // Not even at the first stop
    if (departureTime >= arrivalTime) isWaiting = true; // Went through all his stops
    if (!isWaiting) polylineNo -= 1;

    return [polylineNo, departureTime, arrivalTime, isWaiting];
  }

  private getLineNoAndProgress(polyline: Polyline, departureTime: number, arrivalTime: number) {
    const polylineProgress = (this.animationVisualizationTime - departureTime) / (arrivalTime - departureTime);

    const coefficients = polyline.coefficients;
    let lineProgress = 0;
    let cummulativeProgress = 0;
    let lineNo = 0;
    for (; lineNo < coefficients.length; ++lineNo) {
      const nextCummulativeProgress = cummulativeProgress + coefficients[lineNo];
      if (polylineProgress < nextCummulativeProgress) {
        lineProgress = (polylineProgress - cummulativeProgress) / (nextCummulativeProgress - cummulativeProgress);
        break;
      }
      cummulativeProgress = nextCummulativeProgress;
    }

    return [lineNo, lineProgress];
  }

  private applyInterpolation(vehicleEntity: VehicleEntity, polyline: Polyline, polylineNo: number, lineNo: number, lineProgress: number) {
    let geoPosA = polyline.polyline[lineNo];
    let geoPosB = polyline.polyline[lineNo + 1];

    if (!geoPosB) {
      geoPosB = geoPosA;
      geoPosA = polyline.polyline[lineNo -1];
      lineProgress = 1;
    }

    const pointA = this.utils.latLngToLayerPoint([geoPosA.latitude, geoPosA.longitude]);
    const pointB = this.utils.latLngToLayerPoint([geoPosB.latitude, geoPosB.longitude]);

    const newPosition = pointB
    .multiplyBy(lineProgress)
    .add(pointA.multiplyBy(1 - lineProgress));
    
    vehicleEntity.sprite.x = newPosition.x;
    vehicleEntity.sprite.y = newPosition.y;

    // Set orientation
    const direction = pointB.subtract(pointA);
    const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
    vehicleEntity.sprite.rotation = angle;

    if (this.selectedVehicle?.id == vehicleEntity.data.id) this.redrawPolyline(polylineNo, lineNo, newPosition);
  }

  private redrawPolyline(polylineNo: number, lineNo: number, interpolatedPoint: L.Point) {
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

    {
      const geoPos = polyline[0];
      const point = this.utils.latLngToLayerPoint([geoPos.latitude, geoPos.longitude]);
      graphics.moveTo(point.x, point.y);
    }

    // Draw all poylines before the polylineNo
    for (let i = 0; i < polylineNo; ++i) {
      const polyline = polylines[i];
      for (let j = 1; j < polyline.polyline.length; ++j) {
        const geoPos = polyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([geoPos.latitude, geoPos.longitude]);
        graphics.lineTo(point.x, point.y);
      }
    }

    // Draw all the lines of polylineNo but before lineNo
    const currentPolyline = polylines[polylineNo];
    for (let j = 1; j <= lineNo; ++j) {
      const geoPos = currentPolyline.polyline[j];
      const point = this.utils.latLngToLayerPoint([geoPos.latitude, geoPos.longitude]);
      graphics.lineTo(point.x, point.y);
    }

    // Draw line until interpolated point
    graphics.lineTo(interpolatedPoint.x, interpolatedPoint.y);

    // Change color
    graphics.lineStyle(width, this.DESATURED_BLUE, ALPHA);

    // Draw rest of lines of polylineNo
    for (let j = lineNo + 1; j < currentPolyline.polyline.length; ++j) {
      const geoPos = currentPolyline.polyline[j];
      const point = this.utils.latLngToLayerPoint([geoPos.latitude, geoPos.longitude]);
      graphics.lineTo(point.x, point.y);
    }

    // Draw rest of polylines
    for (let i = polylineNo + 1; i < polylines.length; ++i) {
      const polyline = polylines[i];
      for (let j = 1; j < polyline.polyline.length; ++j) {
        const geoPos = polyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([geoPos.latitude, geoPos.longitude]);
        graphics.lineTo(point.x, point.y);
      }
    }
  }
  
  private updateAnimationTime() {
    const deltaSec = this.ticker.deltaMS / 1000;
    this.animationVisualizationTime += deltaSec;

    const desyncDiff = this.lastVisualisationTime - this.animationVisualizationTime;
    const absDesyncDiff = Math.abs(desyncDiff);
    if (absDesyncDiff > this.MIN_LERPABLE_DESYNC_DIFF && absDesyncDiff < this.MAX_LERPABLE_DESYNC_DIFF) {
      this.animationVisualizationTime += desyncDiff * (1 - Math.exp(-5 * deltaSec));
    }   
  }

  // Called once when Pixi layer is added.
  private onAdd(utils: L.PixiOverlayUtils) {
    this.lastScale = utils.getScale();
    console.log('[PixiJS layer added.]');
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

  private onClick(event: L.LeafletMouseEvent) {
    // Do something.
  }

  private onEntityPointerdown(event: PIXI.FederatedPointerEvent) {
    const sprite = event.target as EntityOwner;
    if (!sprite) return;

    const entity = sprite.entity;
    if (!entity) return;

    this.selectedVehicle = entity.data;
    console.log(this.selectedVehicle);
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

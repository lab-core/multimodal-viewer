import { Injectable, signal, WritableSignal } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { Entity, EntityOwner, VehicleEntity } from '../interfaces/entity.model';
import { SimulationEnvironment, Vehicle } from '../interfaces/simulation.model';
import { Polylines } from '../interfaces/simulation.model';
import { MapService } from './map.service';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  private readonly MAX_DESYNC_DIFF = 1.5;
  private readonly LIGHT_RED = 0xFFCDCD;
  private readonly LIGHT_BLUE = 0xCDCDFF;
  private readonly SATURATED_RED = 0xCD2222;
  private readonly SKY_BLUE = 0x00A2E8;
  private readonly LIGHT_GREY = 0x7F7F7F;

  private pause: boolean = false;
  private animationVisualizationTime: number = 0;

  private ticker: PIXI.Ticker = new PIXI.Ticker();
  private vehicles: VehicleEntity[] = [];
  private container = new PIXI.Container();

  private lastScale: number = 0;
  private utils!: L.PixiOverlayUtils;

  private selectedVehicle: Vehicle | null = null;
  private selectedVehiclePolyline: PIXI.Graphics = new PIXI.Graphics();

  constructor() {

  }

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

  synchronizeTime(visualizationTimeSignal: number) {
    console.log('[anim]', this.animationVisualizationTime.toFixed(2), '[simu]', visualizationTimeSignal);
    
    const timeDifference = this.animationVisualizationTime - visualizationTimeSignal;
    if (Math.abs(timeDifference) > this.MAX_DESYNC_DIFF)  {
      console.log('syncthime time because difference is ', timeDifference)
      this.animationVisualizationTime = visualizationTimeSignal;
    }
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

        // Calculate polyline progress
        /////////////////
        let departureTime = vehicle.data.previousStops[polylineNo].departureTime ?? 0;
        let arrivalTime = vehicle.data.nextStops[0].arrivalTime;
        if (departureTime >= arrivalTime) {
          console.log('something went wrong...', vehicle)
          continue;
        };
        let polylineProgress = (this.animationVisualizationTime - departureTime) / (arrivalTime - departureTime);
        /////////////////

        polyline = vehicle.data.polylines[polylineNo];
        if (!polyline) {
          console.error('no polyline', polylineProgress, polylineNo, vehicle.data);
          continue;
        }

        // Find line number and line progress
        /////////////////
        let coefficients = polyline.coefficients;
        let cummulativeProgress = 0;
        lineNo = 0;
        for (; lineNo < coefficients.length; ++lineNo) {
          let nextCummulativeProgress = cummulativeProgress + coefficients[lineNo];
          if (polylineProgress < nextCummulativeProgress) {
            lineProgress = (polylineProgress - cummulativeProgress) / (nextCummulativeProgress - cummulativeProgress);
            break;
          }
          cummulativeProgress = nextCummulativeProgress;
        }
        /////////////////

        // Log progress if vehicle is selected
        if (vehicle.data.id == this.selectedVehicle?.id) {
          console.log('[polylineProgress]', vehicle.data.id, polylineProgress.toFixed(2), '[polylineNo]', polylineNo, '[noLine]', lineNo);
        }
      }

      // Interpolate position
      ////////////////////////////
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
      
      vehicle.sprite.x = newPosition.x;
      vehicle.sprite.y = newPosition.y;


      if (vehicle.data.id == this.selectedVehicle?.id) {
        this.redrawPolyline(polylineNo, lineNo, newPosition);
      }

      ////////////////////////////

      // Set orientation
      const direction = pointB.subtract(pointA);
      const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
      vehicle.sprite.rotation = angle;
    }    

  }

  private redrawPolyline(polylineNo: number, lineNo: number, interpolatedPoint: L.Point) {
    const BASE_LINE_WIDTH = 4;
    const MIN_WIDTH = 0.04; // By testing out values
    const ALPHA = 0.9;

    const width = Math.max(BASE_LINE_WIDTH / this.utils?.getScale(), MIN_WIDTH);

    let graphics = this.selectedVehiclePolyline;
    graphics.clear();
    graphics.lineStyle(width, this.SKY_BLUE, ALPHA);

    
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
    graphics.lineStyle(width, this.LIGHT_GREY, ALPHA);

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
    if (!this.pause) this.animationVisualizationTime += this.ticker.deltaMS / 1000;

    this.setVehiclePositions();
  }

  private onClick(event: L.LeafletMouseEvent) {

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

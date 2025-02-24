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
  fpsSignal: WritableSignal<number> = signal(0);

  private ticker: PIXI.Ticker = new PIXI.Ticker();
  private vehicles: VehicleEntity[] = [];

  private container = new PIXI.Container();
  private utils!: L.PixiOverlayUtils;
  private pause: boolean = false;

  private lastSelectedEntity: VehicleEntity | undefined;

  private animationVisualizationTime: number = 0;

  constructor(private readonly mapService: MapService) {

  }

  synchronizeTime(simulationEnvironment: SimulationEnvironment, visualizationTimeSignal: number) {
    //console.log('animation service');
    //console.log(visualizationTimeSignal);

    // visualizationTimeSignal += 900; // Make the damn vehicles move NOW
    // If animation time is a second too late/too soon than simulation time, sync it.
    console.log('Simulation env: ', simulationEnvironment);
    console.log('[anim]', this.animationVisualizationTime.toFixed(2), '[simu]', visualizationTimeSignal);
    
    const timeDifference = this.animationVisualizationTime - visualizationTimeSignal;
    if (Math.abs(timeDifference) > 1.5)  {
      console.log('syncthime time because difference is ', timeDifference)
      this.animationVisualizationTime = visualizationTimeSignal;
    }



    let vehicleIdStillAlive = false;
    if (!this.lastSelectedEntity) vehicleIdStillAlive = true;

    this.container.removeChildren();
    this.vehicles = [];
    for (const vehicle of Object.values(simulationEnvironment.vehicles)) {
      if (this.lastSelectedEntity && this.lastSelectedEntity.data.id == vehicle.id) vehicleIdStillAlive = true;
      this.addVehicle(vehicle);
    }

    if (vehicleIdStillAlive == false)  {
      this.lastSelectedEntity = undefined;
      console.error('the vehicle you were looking at is not in the environment anymore..')
    }
  }

  addVehicle(vehicle: Vehicle, type = 'sample-bus') {
    if (!vehicle.polylines)  {
      if (vehicle.id == this.lastSelectedEntity?.data.id) console.error('the vehicle you watched has no more poylines', vehicle);
      //console.error('vehicle has no polyline', vehicle);
      return;
    };

    if (!vehicle.polylines[0])  {
      if (vehicle.id == this.lastSelectedEntity?.data.id) console.error('the vehicle you watched poyline obj but is empty', vehicle);
      //console.error('vehicle poyline obj but is empty', vehicle);
      return;
    }

    if (vehicle.polylines[0].polyline.length == 0) {
      if (vehicle.id == this.lastSelectedEntity?.data.id) console.error('the vehicle you watched has one polyline but has no lines', vehicle);
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

    //this.vehicleIDs[vehicle.id] = entity;

    
    // this.updateVehiclePath(entity);
    // entity.sprite.rotation = entity.requestedRotation;

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
    const time = this.animationVisualizationTime;
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicle = this.vehicles[index];

      if (vehicle.data.polylines == null)  {
        console.error(`vehicle ${vehicle.data.id} has no polyline`);
        continue;
      };

      // if (vehicle.data.id == this.lastSelectedEntity?.data.id) console.log(vehicle);

      // If we have a current stop
      if (vehicle.data.currentStop) {
        if (vehicle.data.id == this.lastSelectedEntity?.data.id) console.log('ur vehicle has a currenstop now', vehicle)
        let polylineNo = vehicle.data.previousStops.length
        let polyline = vehicle.data.polylines[polylineNo];

        if (polyline == null) {
          //console.error('no polyline', polylineNo, vehicle.data);
          // get last polyline
          polyline = vehicle.data.polylines[Object.values(vehicle.data.polylines).length -1]
        }
        const geoPos = polyline.polyline[0];
        if (!geoPos) {
          console.error('geoPos undefined', vehicle.data);
        }
        const point = this.utils.latLngToLayerPoint([geoPos.latitude, geoPos.longitude]);

        if (this.lastSelectedEntity?.data.id == vehicle.data.id) this.mapService.map?.setView([geoPos.latitude, geoPos.longitude]);

        if (vehicle.data.status == 'complete') vehicle.sprite.tint = 0xFFCDCD;
        else if (vehicle.data.status == 'idle') vehicle.sprite.tint = 0xCDCDFF;
        else vehicle.sprite.tint = 0xCD2222;

        vehicle.sprite.x = point.x;
        vehicle.sprite.y = point.y;
        continue;
      }

      let polylineNo = vehicle.data.previousStops.length -1;
      let departureTime = vehicle.data.previousStops[polylineNo].departureTime ?? 0;
      let arrivalTime = vehicle.data.nextStops[0].arrivalTime;

      if (departureTime >= arrivalTime) {
        console.log('something went wrong...', vehicle)
        continue;
      };

      let polylineProgress = (time - departureTime) / (arrivalTime - departureTime);
      let polyline = vehicle.data.polylines[polylineNo];
      if (!polyline) {
        console.error('no polyline', polylineProgress, polylineNo, vehicle.data);
      }
      let coefficients = polyline.coefficients;

      let cummulativeProgress = 0;
      let lineNo = 0;
      let lineProgress = 0;
      // Find we're in which line
      for (; lineNo < coefficients.length; ++lineNo) {
        let nextCummulativeProgress = cummulativeProgress + coefficients[lineNo];

        // Are we below the progress of this line?
        if (polylineProgress < nextCummulativeProgress) {
          lineProgress = (polylineProgress - cummulativeProgress) / (nextCummulativeProgress - cummulativeProgress);
          break;
        }

        cummulativeProgress = nextCummulativeProgress;
      }

      if (vehicle.data.id == this.lastSelectedEntity?.data.id) {
        console.log('[polylineProgress]', vehicle.data.id, polylineProgress.toFixed(2), '[polylineNo]', polylineNo, '[noLine]', lineNo);
      }

      // console.log('[coefficient]', coefficients[lineNo]);
      // console.log('[cummulativeProgress]', cummulativeProgress);
      // console.log('[lineProgress]', lineProgress);
      // console.log('[polylineNo]', polylineNo);
      // console.log('[lineNo]', lineNo);
      // console.log('[timeToReach]', timeToReach);
      // console.log('[currentTime]', currentTime);
      // console.log('------')

      const geoPosA = polyline.polyline[lineNo];
      let geoPosB = polyline.polyline[lineNo + 1];

      // if (!geoPosA) {};
      if (!geoPosB) {geoPosB = geoPosA}//{console.error('no geoposB',  polylineProgress, polylineNo, lineNo, vehicle); continue};;
      const pointA = this.utils.latLngToLayerPoint([geoPosA.latitude, geoPosA.longitude]);
      const pointB = this.utils.latLngToLayerPoint([geoPosB.latitude, geoPosB.longitude]);
  
      // Set orientation
      const direction = pointB.subtract(pointA);
      const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
      vehicle.sprite.rotation = angle;

      const newPosition = pointB
      .multiplyBy(lineProgress)
      .add(pointA.multiplyBy(1 - lineProgress));
      
      vehicle.sprite.tint = 0xFFFFFF;
      vehicle.sprite.x = newPosition.x;
      vehicle.sprite.y = newPosition.y;
    }    

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
    if (!this.pause) this.animationVisualizationTime += this.ticker.deltaMS / 1000;
    const fps = Math.round(1000 / this.ticker.deltaMS);
    this.fpsSignal.set(fps);

    this.setVehiclePositions();
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
    console.log(entity.data)
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

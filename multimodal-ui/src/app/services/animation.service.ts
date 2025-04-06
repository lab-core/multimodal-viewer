import 'leaflet-pixi-overlay';

import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { color as d3Color } from 'd3-color';
import { interpolateRgb as d3InterpolateRgb } from 'd3-interpolate';
import * as L from 'leaflet';
import { pixiOverlay } from 'leaflet';
import { OutlineFilter } from 'pixi-filters';
import * as PIXI from 'pixi.js';
import { Entity, EntityFilterMode } from '../interfaces/entity.model';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedVehicle,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  getAllStops,
  Polyline,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  Vehicle,
} from '../interfaces/simulation.model';
import { FavoriteEntitiesService } from './favorite-entities.service';

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

  private readonly BITMAPTEXT_URL = 'bitmap-fonts/custom-sans-serif.xml';
  private readonly BITMAPTEXT_STYLE: Partial<PIXI.IBitmapTextStyle> = {
    fontName: 'custom-sans-serif',
    fontSize: 18,
  };

  private readonly TEXT_STYLE = new PIXI.TextStyle({
    fontFamily: 'Arial',
    fontSize: 18,
    fontWeight: 'bold',
    fill: '#ffffff',
    stroke: '#333333',
    strokeThickness: 5,
    lineJoin: 'round',
  });

  private pause = false;
  private animationVisualizationTime = 0;
  private lastVisualisationTime = 0;

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

  // Filters
  private filters: Set<string> = new Set<string>();
  private filterMode: EntityFilterMode = 'all';

  private speed = 1;
  private readonly _shouldFollowEntitySignal: WritableSignal<boolean> =
    signal(false);

  get shouldFollowEntitySignal(): Signal<boolean> {
    return this._shouldFollowEntitySignal;
  }

  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
  ) {
    void PIXI.Assets.load(this.BITMAPTEXT_URL);
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
      simulationEnvironment.currentState.vehicles,
    )) {
      this.addVehicle(vehicle);
      if (selectedVehicleId !== null && vehicle.id == selectedVehicleId) {
        isSelectedVehicleInEnvironment = true;
        this.hightlightEntityId(vehicle.id, 'vehicle');
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
      simulationEnvironment.currentState.passengers,
    )) {
      this.addPassenger(passenger);
      if (selectedPassengerId !== null && passenger.id == selectedPassengerId) {
        isSelectedPassengerInEnvironment = true;
        this.hightlightEntityId(passenger.id, 'passenger');
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
    if (
      animatedSimulationEnvironment.currentState.timestamp != visualizationTime
    ) {
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
    const vehicleContainer = new PIXI.Container();
    const sprite = PIXI.Sprite.from(`images/${type}.png`);
    vehicleContainer.scale.set(1 / this.utils.getScale());
    sprite.anchor.set(0.5, 0.5); // Center texture on coordinate
    vehicleContainer.addChild(sprite);

    const passengerCountText = new PIXI.BitmapText('', this.BITMAPTEXT_STYLE);
    passengerCountText.anchor.set(0, 0.5); // Center y on coordinate y
    passengerCountText.x = sprite.width / 2; // Move text to the right-end of the container
    vehicleContainer.addChild(passengerCountText);

    const entity: Entity<AnimatedVehicle> = {
      data: vehicle,
      sprite,
      text: passengerCountText,
      show: true,
    };

    this.container.addChild(vehicleContainer);
    this.vehicles.push(entity);
    this.vehicleEntitiesByVehicleId[vehicle.id] = entity;
  }

  private addPassenger(passenger: AnimatedPassenger): void {
    const sprite = PIXI.Sprite.from('images/sample-walk.png');
    sprite.anchor.set(0.5, 0.5); // Center texture on coordinate
    sprite.scale.set(1 / this.utils.getScale());

    const entity: Entity<AnimatedPassenger> = {
      data: passenger,
      sprite,
      show: true,
    };

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
    this.previousVehiclesEntities = [];
    this.previousPassengerEntities = [];
  }

  setPause(pause: boolean) {
    this.pause = pause;
  }

  setFilters(filters: Set<string>) {
    this.filters = filters;
  }

  setFilterMode(filterMode: EntityFilterMode) {
    this.filterMode = filterMode;
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

  private filterEntities() {
    const filters = this.filters;

    const showVehicles = !filters.has('vehicle');
    const showPassengers = !filters.has('passenger');
    const showFavoritesOnly = this.filterMode === 'favorites';

    for (const vehicle of this.vehicles)
      vehicle.sprite.parent.visible =
        vehicle.show &&
        showVehicles && // Are vehicles not filtered
        !filters.has(vehicle.data.mode ?? 'unknown') && // Is bus mode not filtered
        (!showFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService.favVehicleIds().has(vehicle.data.id));

    for (const passenger of this.passengersEntities)
      passenger.sprite.visible =
        passenger.show &&
        showPassengers && // Are passengers not filtered
        (!showFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService
            .favPassengerIds()
            .has(passenger.data.id));
  }

  private setVehiclePositions() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicleEntity = this.vehicles[index];
      const vehicle = vehicleEntity.data;

      vehicle.passengerCount = 0;

      if (!vehicle.animationData) {
        vehicleEntity.show = false;
        continue;
      }

      const animationData = vehicle.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );

      // Vehicle has no animation data
      // This can happen if the vehicle is not in the environment yet
      if (!animationData) {
        vehicleEntity.show = false;
        continue;
      }

      switch (animationData.status) {
        case 'alighting':
        case 'boarding':
        case 'idle':
        case 'release':
          vehicleEntity.sprite.tint = this.LIGHT_BLUE;
          break;
        case 'complete':
          vehicleEntity.sprite.tint = this.LIGHT_RED;
          break;
        case 'enroute':
          vehicleEntity.sprite.tint = this.WHITE;
          break;
      }

      const polylineIndex: number =
        animationData.displayedPolylines.currentPolylineIndex;
      let point: L.Point | null = null;
      if (animationData.notDisplayedReason !== null) {
        // Vehicle has an error
        vehicleEntity.show = false;
        // console.error(
        //   `Vehicle ${vehicle.id} has an error: ${animationData.notDisplayedReason}`,
        // );
      } else if (
        (animationData as StaticVehicleAnimationData).position !== undefined
      ) {
        vehicleEntity.show = true;
        const staticVehicleAnimationData =
          animationData as StaticVehicleAnimationData;
        point = this.utils.latLngToLayerPoint([
          staticVehicleAnimationData.position.latitude,
          staticVehicleAnimationData.position.longitude,
        ]);
        vehicleEntity.sprite.parent.x = point.x;
        vehicleEntity.sprite.parent.y = point.y;
        vehicleEntity.data.currentLineIndex =
          polylineIndex === -1
            ? 0
            : (animationData.displayedPolylines.polylines[polylineIndex]
                ?.polyline.length ?? 0) - 1;
      } else if (
        (animationData as DynamicVehicleAnimationData).polyline !== undefined
      ) {
        vehicleEntity.show = true;
        const dynamicVehicleAnimationData =
          animationData as DynamicVehicleAnimationData;
        const [lineNo, lineProgress] = this.getLineNoAndProgress(
          dynamicVehicleAnimationData.displayedPolylines,
        );
        point = this.applyInterpolation(
          vehicleEntity,
          dynamicVehicleAnimationData.displayedPolylines.polylines[
            Math.min(
              polylineIndex,
              dynamicVehicleAnimationData.displayedPolylines.polylines.length -
                1,
            )
          ],
          lineNo,
          lineProgress,
        );
        vehicleEntity.data.currentLineIndex = lineNo;
      } else {
        // Vehicle has an unknown error
        vehicleEntity.show = false;
      }

      const selectedVehicleId = this._selectedVehicleIdSignal();
      if (
        vehicleEntity.sprite.visible &&
        selectedVehicleId !== null &&
        selectedVehicleId === vehicle.id &&
        vehicleEntity.data.currentLineIndex !== null &&
        point !== null
      ) {
        this.frame_pointToFollow = this.utils.layerPointToLatLng(point);
        this.redrawPolyline(
          polylineIndex,
          vehicleEntity.data.currentLineIndex,
          point,
          animationData.displayedPolylines.polylines,
        );
      }
    }
  }

  private setPassengerPositions() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.passengersEntities.length; ++index) {
      const passengerEntity = this.passengersEntities[index];
      const passenger = passengerEntity.data;

      if (!passenger.animationData) {
        passengerEntity.show = false;
        continue;
      }

      const animationData = passenger.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );

      // Passenger has no animation data
      // This can happen if the passenger is not in the environment yet
      if (!animationData) {
        passengerEntity.show = false;
        continue;
      }

      switch (animationData.status) {
        case 'release':
          passengerEntity.sprite.tint = '0xffff00'; // Yellow
          break;
        case 'assigned':
          passengerEntity.sprite.tint = '0x0000ff'; // Blue
          break;
        case 'ready':
          passengerEntity.sprite.tint = '0x00ff00'; // Green
          break;
        case 'onboard':
          passengerEntity.sprite.tint = '0x00ffff'; // Cyan
          break;
        case 'complete':
          passengerEntity.sprite.tint = '0xff00ff'; // Magenta
          break;
      }

      if (animationData.notDisplayedReason !== null) {
        // Passenger has an error
        passengerEntity.show = false;
      } else if (
        (animationData as StaticPassengerAnimationData).stopIndex !==
          undefined &&
        animationData.vehicleId !== null
      ) {
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[animationData.vehicleId];
        const allStops = getAllStops(vehicleEntity.data);
        const stop =
          allStops[(animationData as StaticPassengerAnimationData).stopIndex];
        if (stop !== undefined) {
          passengerEntity.show = true;
          const point = this.utils.latLngToLayerPoint([
            stop.position.latitude,
            stop.position.longitude,
          ]);
          passengerEntity.sprite.x = point.x;
          passengerEntity.sprite.y = point.y;
        }
      } else if (
        (animationData as DynamicPassengerAnimationData).isOnBoard === true &&
        animationData.vehicleId !== null
      ) {
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[animationData.vehicleId];
        if (vehicleEntity) {
          vehicleEntity.data.passengerCount += 1;
          passengerEntity.show = vehicleEntity.show;
          passengerEntity.sprite.x = vehicleEntity.sprite.parent.x;
          passengerEntity.sprite.y = vehicleEntity.sprite.parent.y;
        }
      } else {
        // Passenger has an unknown error
        passengerEntity.show = false;
      }

      const selectedPassengerId = this._selectedPassengerIdSignal();
      if (
        passengerEntity.show &&
        passengerEntity.sprite.visible &&
        selectedPassengerId !== null &&
        selectedPassengerId === passenger.id
      ) {
        this.frame_pointToFollow = this.utils.layerPointToLatLng(
          new L.Point(passengerEntity.sprite.x, passengerEntity.sprite.y),
        );
        this.redrawPassengerPolyline();
      }
    }

    //   if (animationData.notDisplayedReason !== null) {
    //     // Passenger has an error
    //     passenger.show = false;
    //   } else if (
    //     (animationData as StaticPassengerAnimationData).position !== undefined
    //   ) {
    //     passenger.show = true;
    //     const staticPassengerAnimationData =
    //       animationData as StaticPassengerAnimationData;
    //     const point = this.utils.latLngToLayerPoint([
    //       staticPassengerAnimationData.position.latitude,
    //       staticPassengerAnimationData.position.longitude,
    //     ]);
    //     passenger.sprite.x = point.x;
    //     passenger.sprite.y = point.y;
    //   } else if (animationData.vehicleId !== null) {
    //     passenger.show = true;
    //     const vehicleEntity =
    //       this.vehicleEntitiesByVehicleId[animationData.vehicleId];
    //     if (vehicleEntity) {
    //       passenger.show = vehicleEntity.show;
    //       passenger.sprite.x = vehicleEntity.sprite.x;
    //       passenger.sprite.y = vehicleEntity.sprite.y;
    //     }
    //   } else {
    //     // Passenger has an unknown error
    //     passenger.show = false;
    //   }
    //   const selectedPassengerId = this._selectedPassengerIdSignal();
    //   if (
    //     passenger.sprite.visible &&
    //     selectedPassengerId !== null &&
    //     selectedPassengerId === passenger.data.id
    //   ) {
    //     this.frame_pointToFollow = this.utils.layerPointToLatLng(
    //       new L.Point(passenger.sprite.x, passenger.sprite.y),
    //     );
    //   }
    // }
  }

  private updateVehiclePassengerCounters() {
    const MAX_PASSENGER_COUNT_VALUE = 50;
    const MIN_COLOR = '#ffffff'; // WHITE
    const MAX_COLOR = '#ff0000'; // RED

    const interpolate = d3InterpolateRgb(MIN_COLOR, MAX_COLOR);

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicleEntity = this.vehicles[index];
      const passengerCount = vehicleEntity.data.passengerCount;

      if (passengerCount === 0) vehicleEntity.text!.text = '';
      else vehicleEntity.text!.text = passengerCount.toString();

      const t =
        Math.min(passengerCount, MAX_PASSENGER_COUNT_VALUE) /
        MAX_PASSENGER_COUNT_VALUE;
      const color = d3Color(interpolate(t))?.rgb();
      if (!color) continue;

      const tint = 256 * (color.r * 256 + color.g) + color.b;
      vehicleEntity.text!.tint = tint;
    }
  }

  private getLineNoAndProgress(displayedPolylines: DisplayedPolylines) {
    if (
      displayedPolylines.currentPolylineEndTime === null ||
      displayedPolylines.currentPolylineStartTime === null
    ) {
      return [0, 0];
    }

    if (displayedPolylines.currentPolylineIndex === -1) {
      return [0, 0];
    }

    if (
      displayedPolylines.currentPolylineIndex >=
      displayedPolylines.polylines.length
    ) {
      return [0, 0];
    }

    const polylineProgress =
      (this.animationVisualizationTime -
        displayedPolylines.currentPolylineStartTime) /
      (displayedPolylines.currentPolylineEndTime -
        displayedPolylines.currentPolylineStartTime);

    const polyline =
      displayedPolylines.polylines[displayedPolylines.currentPolylineIndex];

    const coefficients = polyline.coefficients;
    let lineProgress = 0;
    let cumulativeProgress = 0;
    let lineNo = 0;
    for (; lineNo < coefficients.length; ++lineNo) {
      const nextCumulativeProgress = cumulativeProgress + coefficients[lineNo];
      if (polylineProgress < nextCumulativeProgress) {
        lineProgress =
          (polylineProgress - cumulativeProgress) /
          (nextCumulativeProgress - cumulativeProgress);
        break;
      }
      cumulativeProgress = nextCumulativeProgress;
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

    vehicleEntity.sprite.parent.x = interpolatedPosition.x;
    vehicleEntity.sprite.parent.y = interpolatedPosition.y;

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
      if (!vehicle.sprite.visible) continue;
      const distance = this.distanceBetweenPoints(
        point,
        vehicle.sprite.parent.position,
      );
      if (distance <= minVisualDistance) nearVehicles.push(vehicle.data.id);
    }

    // Distances for all passengers
    for (const passenger of this.passengersEntities) {
      if (!passenger.sprite.visible) continue;
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

  private redrawPassengerPolyline() {
    const selectedPassengerId = this._selectedPassengerIdSignal();
    if (!selectedPassengerId) return;

    const passenger = this.passengerEntitiesByPassengerId[selectedPassengerId];
    if (!passenger) return;

    const passengerAnimationData = passenger.data.animationData.find(
      (data) =>
        data.startTimestamp <= this.animationVisualizationTime &&
        data.endTimestamp! >= this.animationVisualizationTime,
    );

    const legs = passenger.data.currentLeg
      ? [
          ...passenger.data.previousLegs,
          passenger.data.currentLeg,
          ...passenger.data.nextLegs,
        ]
      : [...passenger.data.previousLegs, ...passenger.data.nextLegs];

    const polylines: Polyline[] = [];

    let reachedCurrentVehicle = false;
    let calculatedPolylineNo = 0;
    let lineNo = 0;

    // Collect all polylines
    for (const leg of legs) {
      if (
        leg.assignedVehicleId === null ||
        leg.boardingStopIndex === null ||
        leg.alightingStopIndex === null
      )
        continue;

      const vehicle = this.vehicleEntitiesByVehicleId[leg.assignedVehicleId];
      if (!vehicle) continue;

      const vehicleAnimationData = vehicle.data.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );
      if (vehicleAnimationData === undefined) continue;

      // Get polylines that passenger will be inside vehicle
      const passengerPath =
        vehicleAnimationData.displayedPolylines.polylines.slice(
          leg.boardingStopIndex,
          leg.alightingStopIndex,
        );

      // When we reach our waiting/current vehicle
      if (vehicle.data.id === passengerAnimationData?.vehicleId) {
        reachedCurrentVehicle = true;

        const relativePolylineIndex =
          vehicleAnimationData.displayedPolylines.currentPolylineIndex -
          leg.boardingStopIndex;

        // When vehicle did not reach him yet
        if (relativePolylineIndex >= 0) {
          calculatedPolylineNo += relativePolylineIndex;
          lineNo = vehicle.data.currentLineIndex ?? 0;
        }
      } else if (!reachedCurrentVehicle)
        calculatedPolylineNo += passengerPath.length;

      polylines.push(...passengerPath);
    }
    if (polylines.length === 0) return;

    if (calculatedPolylineNo < 0) {
      calculatedPolylineNo = 0;
      lineNo = 0;
    }

    this.redrawPolyline(
      calculatedPolylineNo,
      lineNo,
      new L.Point(passenger.sprite.x, passenger.sprite.y),
      polylines,
    );
  }

  private redrawPolyline(
    polylineNo: number,
    lineNo: number,
    interpolatedPoint: L.Point,
    polylines: Polyline[],
  ) {
    const BASE_LINE_WIDTH = 4;
    const MIN_WIDTH = 0.04; // By testing out values
    const ALPHA = 0.9;
    const width = Math.max(BASE_LINE_WIDTH / this.utils?.getScale(), MIN_WIDTH);
    const graphics = this.selectedEntityPolyline;
    graphics.clear();
    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

    // Draw all polylines before the polylineNo
    for (let i = 0; i < polylineNo; ++i) {
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;
      const firstPoint = polyline.polyline[0];
      const firstLayerPoint = this.utils.latLngToLayerPoint([
        firstPoint.latitude,
        firstPoint.longitude,
      ]);
      graphics.moveTo(firstLayerPoint.x, firstLayerPoint.y);

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
    if (currentPolyline !== undefined) {
      const polylinePoints = currentPolyline.polyline;
      if (polylinePoints.length === 0) return;
      const firstPoint = polylinePoints[0];
      const firstLayerPoint = this.utils.latLngToLayerPoint([
        firstPoint.latitude,
        firstPoint.longitude,
      ]);
      graphics.moveTo(firstLayerPoint.x, firstLayerPoint.y);

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
    }

    graphics.lineStyle(width, this.LIGHT_GRAY, ALPHA);

    // Draw rest of polylines
    for (let i = polylineNo + 1; i < polylines.length; ++i) {
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;
      const firstPoint = polyline.polyline[0];
      const firstLayerPoint = this.utils.latLngToLayerPoint([
        firstPoint.latitude,
        firstPoint.longitude,
      ]);
      graphics.moveTo(firstLayerPoint.x, firstLayerPoint.y);
      for (let j = 1; j < polyline.polyline.length; ++j) {
        const geoPos = polyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([
          geoPos.latitude,
          geoPos.longitude,
        ]);
        graphics.lineTo(point.x, point.y);
      }
    }

    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

    let firstStopHasBeenDrawn = false;

    // Draw stops that are completed
    for (let i = 0; i <= polylineNo; ++i) {
      if (i >= polylines.length) break;
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;

      if (!firstStopHasBeenDrawn) {
        const firstPoint = polyline.polyline[0];
        const firstLayerPoint = this.utils.latLngToLayerPoint([
          firstPoint.latitude,
          firstPoint.longitude,
        ]);
        graphics.beginFill(this.WHITE, 1);
        graphics.drawCircle(firstLayerPoint.x, firstLayerPoint.y, width * 1.2);
        graphics.endFill();
        firstStopHasBeenDrawn = true;
      }

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

    for (let i = Math.max(polylineNo, 0); i < polylines.length; ++i) {
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;

      if (!firstStopHasBeenDrawn) {
        const firstPoint = polyline.polyline[0];
        const firstLayerPoint = this.utils.latLngToLayerPoint([
          firstPoint.latitude,
          firstPoint.longitude,
        ]);
        graphics.beginFill(this.WHITE, 1);
        graphics.drawCircle(firstLayerPoint.x, firstLayerPoint.y, width * 1.2);
        graphics.endFill();
        firstStopHasBeenDrawn = true;
      }

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
    const deltaSec = PIXI.Ticker.shared.deltaMS / 1000;
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
      entity.sprite.parent.scale.set(invScale);
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
    this.updateVehiclePassengerCounters();
    this.filterEntities();
  }

  // onClick is called after onEntityPointerdown
  private onClick(event: L.LeafletMouseEvent) {
    this.findVisuallyNearEntities(event);
  }

  private selectVehicle(vehicleId: string) {
    this.unselectPassenger();
    this.hightlightEntityId(vehicleId, 'vehicle');
    this._selectedVehicleIdSignal.set(vehicleId);
  }

  private selectPassenger(passengerId: string) {
    this.unselectVehicle();
    this.hightlightEntityId(passengerId, 'passenger');
    this._selectedPassengerIdSignal.set(passengerId);
  }

  private unselectVehicle() {
    this.unhighlightEntityId(this._selectedVehicleIdSignal(), 'vehicle');
    this._selectedVehicleIdSignal.set(null);
    this.selectedEntityPolyline.clear();
  }

  private unselectPassenger() {
    this.unhighlightEntityId(this._selectedPassengerIdSignal(), 'passenger');
    this._selectedPassengerIdSignal.set(null);
    this.selectedEntityPolyline.clear();
  }

  private hightlightEntityId(entityId: string, type: 'vehicle' | 'passenger') {
    const entitiesById =
      type === 'vehicle'
        ? this.vehicleEntitiesByVehicleId
        : this.passengerEntitiesByPassengerId;
    const entity = entitiesById[entityId];
    if (entity)
      entity.sprite.filters = [
        new OutlineFilter(1, 0xffffff),
        new OutlineFilter(2, 0xffff00),
      ];
  }

  private unhighlightEntityId(
    entityId: string | null,
    type: 'vehicle' | 'passenger',
  ) {
    if (!entityId) return;
    const entitiesById =
      type === 'vehicle'
        ? this.vehicleEntitiesByVehicleId
        : this.passengerEntitiesByPassengerId;
    const entity = entitiesById[entityId];
    if (entity) entity.sprite.filters = null;
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

    PIXI.Ticker.shared.add((delta) => {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as L.LeafletEvent);

      if (this.frame_pointToFollow && this._shouldFollowEntitySignal())
        this.utils.getMap().setView(this.frame_pointToFollow);
      this.frame_pointToFollow = null;
    });
    PIXI.Ticker.shared.start();
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  toggleShouldFollowEntity() {
    this._shouldFollowEntitySignal.update(
      (shouldFollowEntity) => !shouldFollowEntity,
    );
  }

  findPassengerName(id: string) {
    if(!this.passengerEntitiesByPassengerId[id]) {
      return
    }
    return this.passengerEntitiesByPassengerId[id].data.name as string;
  }

}

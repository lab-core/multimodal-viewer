import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';
import { Entity } from '../interfaces/entity.model';

@Injectable({
  providedIn: 'root'
})
export class AnimationService {
  private ticker: PIXI.Ticker = new PIXI.Ticker();
  private entities: Entity[] = [];
  private container = new PIXI.Container();
  private utils!: L.PixiOverlayUtils;

  private pointToReach: L.Point = new L.Point(45.523066, -73.652687);

  private addEntity(type ="sample-marker") {
    const sprite = PIXI.Sprite.from(`images/${type}.png`);


    sprite.anchor.set(0.5, 1);
    sprite.scale.set(1 / this.utils.getScale());
    this.container.addChild(sprite);


    const entity: Entity = {
      sprite,
      startPos: this.pointToReach,
      endPos: this.pointToReach,
      speed: Math.random() * 2 + 1,
      currentTime: 0,
      timeToReach: 5
    }

    this.entities.push(entity);
  }

  private changeEntitiesDestination(latlng: L.LatLng) {
    this.pointToReach = this.utils.latLngToLayerPoint(latlng);
    this.entities.forEach((entity) => {
      entity.startPos.x = entity.sprite.x;
      entity.startPos.y = entity.sprite.y;
      entity.endPos = this.pointToReach;

      const distanceVec = entity.endPos.subtract(entity.startPos);
      const distance = Math.sqrt(distanceVec.x * distanceVec.x + distanceVec.y * distanceVec.y);
      entity.timeToReach = distance * 0.5 / entity.speed;
      entity.currentTime = 0;
    })
  }

  // Called once when Pixi layer is added.
  private onAdd(utils: L.PixiOverlayUtils) {
    console.log('PixiJS layer added.');
  }

  private onMoveEnd(event: L.LeafletEvent) {
    // this.markers.forEach((marker) => {
    //   marker.scale.set(1 / this.utils.getScale());
    // });
  }

  private onRedraw(event: L.LeafletEvent) {
    this.entities.forEach((entity) => {
      entity.currentTime += this.ticker.deltaTime / this.ticker.FPS;
      const progress = entity.currentTime / entity.timeToReach;
      if (progress >= 1) return;
      const newPosition = entity.endPos.multiplyBy(progress).add(entity.startPos.multiplyBy(1 - progress));
      entity.sprite.x = newPosition.x;
      entity.sprite.y = newPosition.y;
    });
  }

  private onClick(event: L.LeafletMouseEvent) {
    this.changeEntitiesDestination(event.latlng);
    this.addEntity();
  }


  addPixiOverlay(map: L.Map) {
    map.on('click', (event) => {this.onClick(event)});

    const pixiLayer = (() => {
      return L.pixiOverlay((utils, event) => {
        this.utils = utils;
        if (event.type === 'add') this.onAdd(utils);
        if (event.type === 'moveend') this.onMoveEnd(event);
        if (event.type === 'redraw') this.onRedraw(event);
        this.utils.getRenderer().render(this.container);
      }, this.container, {
        doubleBuffering: true
      });
    })();

    pixiLayer.addTo(map);

    this.ticker.add(function (delta) {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as L.LeafletEvent);
    });
    this.ticker.start();
  }
}

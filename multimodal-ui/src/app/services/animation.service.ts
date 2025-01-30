import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';


@Injectable({
  providedIn: 'root'
})
export class AnimationService {
  private markers: PIXI.Sprite[] = [];
  private container = new PIXI.Container();
  private utils: L.PixiOverlayUtils;



  constructor() { 
  
  }

  private addEntity(latlng: L.LatLng, type: string="sample-marker") {
    let marker = PIXI.Sprite.from(`images/${type}.png`);

    let coords = this.utils.latLngToLayerPoint(latlng);
    marker.x = coords.x;
    marker.y = coords.y;
    marker.anchor.set(0.5, 0.5);
    marker.scale.set(1 / this.utils.getScale());

    this.container.addChild(marker);
    this.markers.push(marker);
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
    this.markers.forEach((marker) => {
      marker.x += 0.05 * event.delta;
      marker.y += 0.05 * event.delta;
    });
  }


  addPixiOverlay(map: L.Map) {
    map.on('click', (e) => {
      this.addEntity(e.latlng);
    });

    var pixiLayer = (() => {
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

    let ticker = new PIXI.Ticker();
    ticker.add(function (delta) {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as L.LeafletEvent);
    });
    ticker.start();
  }
}

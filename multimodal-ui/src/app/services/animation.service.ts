import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';


@Injectable({
  providedIn: 'root'
})
export class AnimationService {

  private markers: PIXI.Sprite[] = [];
  private textures: PIXI.Texture[] = [];
  private container = new PIXI.Container();

  private utils: L.PixiOverlayUtils;


  private zoom: number; 
  private renderer: PIXI.IRenderer;
  private project: L.LatLngToLayerPointFn; 
  private scale: number;
  private invScale: number;

  constructor() {
    this.loadTextures();
  }

  private async loadTextures() {
    const texture = await PIXI.Assets.load('img/marker-icon.png');
    this.textures.push(texture);
  }

  private addMarker(latlng: L.LatLng) {
    let marker = PIXI.Sprite.from(this.textures[0]);
    let coords = this.project(latlng);
    marker.x = coords.x;
    marker.y = coords.y;
    marker.anchor.set(0.5, 0.5);
    marker.scale.set(this.invScale);

    this.container.addChild(marker);
    this.markers.push(marker);
  }

  addPixiOverlay(map: L.Map) {
    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');
    map.on('click', (e) => {
      this.addMarker(e.latlng);
    });

    var previousZoom: number | null = null;
    var pixiLayer = (() => {
      // var colorScale = d3.scaleLinear()
      //     .domain([0, 50, 100])
      //     .range(["#c6233c", "#ffd300", "#008000"]);

      return L.pixiOverlay((utils, event) => {
        this.zoom = utils.getMap().getZoom();
        // this.container = utils.getContainer();
        this.renderer = utils.getRenderer();
        this.project = utils.latLngToLayerPoint;
        this.scale = utils.getScale();
        this.invScale = 1 / this.scale;


        if (event.type === 'add') {
        }

        if (event.type === 'moveend' && previousZoom !== this.zoom) {
          this.markers.forEach((marker) => {
            marker.scale.set(this.invScale);
          });
          previousZoom = this.zoom;
        }

        if (event.type === 'redraw') {
          this.markers.forEach((marker) => {
            marker.x += 0.05 * event.delta;
            marker.y += 0.05 * event.delta;
          });
        }

        this.renderer.render(this.container);

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

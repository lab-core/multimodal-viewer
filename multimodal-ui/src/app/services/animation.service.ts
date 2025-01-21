// @ts-nocheck
import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';
import * as L from 'leaflet';
import 'leaflet-pixi-overlay';


@Injectable({
  providedIn: 'root'
})
export class AnimationService {

  constructor() {

  }

  plugPixiOverlayQuickstart(map: L.Map) {
    // var loader = new PIXI.Loader();
    // loader
    //   .add('plane', 'img/plane.png')
    //   .add('bicycle', 'img/bicycle.png');
    // var textures = [resources.plane.texture, resources.bicycle.texture];

    // TODO:
    // const texture = await Assets.load('path/to/assets/background.jpg');
    //const image = Sprite.from(texture);

    map.attributionControl.setPosition('bottomleft');
    map.zoomControl.setPosition('bottomright');
    var pixiContainer = new PIXI.Container();
    var markerSprites: PIXI.Sprite[] = [];
    var previousZoom: number | null = null;
    var pixiLayer = (function () {
      var colorScale = d3.scaleLinear()
        .domain([0, 50, 100])
        .range(["#c6233c", "#ffd300", "#008000"]);
      var doubleBuffering = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      return L.pixiOverlay(function (utils, event) {
        var zoom = utils.getMap().getZoom();
        var container = utils.getContainer();
        var renderer = utils.getRenderer();
        var project = utils.latLngToLayerPoint;
        var scale = utils.getScale();
        var invScale = 1 / scale;

        if (event.type === 'add') {
          markers.forEach(function (marker) {
            var coords = project([marker.latitude, marker.longitude]);
            var index = Math.floor(Math.random() * textures.length);
            var markerSprite = new PIXI.Sprite(textures[index]);
            markerSprite.textureIndex = index;
            markerSprite.x = coords.x;
            markerSprite.y = coords.y;
            markerSprite.anchor.set(0.5, 0.5);
            markerSprite.scale.set(invScale);
            var tint = d3.color(colorScale(Math.random() * 100)).rgb();
            markerSprite.tint = 256 * (tint.r * 256 + tint.g) + tint.b;
            container.addChild(markerSprite);
            markerSprites.push(markerSprite);
          });
        }

        if (event.type === 'moveend' && previousZoom !== zoom) {
          markerSprites.forEach(function (markerSprite) {
            markerSprite.scale.set(invScale);
          });
          previousZoom = zoom;
        }

        if (event.type === 'redraw') {
          var delta = event.delta;
          markerSprites.forEach(function (markerSprite) {
            markerSprite.rotation -= 0.03 * delta;
          });
        }

        renderer.render(container);
      }, pixiContainer, {
        doubleBuffering: doubleBuffering
      });
    })();

    pixiLayer.addTo(map);

    var ticker = new PIXI.Ticker();
    ticker.add(function (delta) {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as L.LeafletEvent);
    });
    ticker.start();
  }
}

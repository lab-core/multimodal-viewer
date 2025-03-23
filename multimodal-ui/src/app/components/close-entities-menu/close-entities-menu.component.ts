import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  signal,
  Signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { AnimationService } from '../../services/animation.service';
import { Point } from 'pixi.js';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-close-entities-menu',
  imports: [MatCardModule, MatChipsModule, MatIconModule],
  templateUrl: './close-entities-menu.component.html',
  styleUrl: './close-entities-menu.component.css',
})
export class CloseEntitiesMenuComponent implements AfterViewInit {
  private readonly offset = 30;
  private readonly maxHeightPadding = 150;

  private clickPositionSignal: Signal<Point>;

  container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  nearVehicles: Signal<string[]>;
  nearPassengers: Signal<string[]>;

  show = signal(false);

  top = computed(() => {
    const y = this.clickPositionSignal().y;

    if (y < window.innerHeight / 2) {
      return y + 'px';
    } else return '';
  });

  bottom = computed(() => {
    const y = this.clickPositionSignal().y;

    if (y >= window.innerHeight / 2) {
      return window.innerHeight - y + 'px';
    } else return '';
  });

  left = computed(() => {
    return this.clickPositionSignal().x + this.offset + 'px';
  });

  maxHeight = computed(() => {
    const y = this.clickPositionSignal().y;

    if (y < window.innerHeight / 2)
      return window.innerHeight - y - this.maxHeightPadding + 'px';
    else return y - this.maxHeightPadding + 'px';
  });

  constructor(private readonly animationService: AnimationService) {
    this.clickPositionSignal = animationService.clickPositionSignal;
    this.nearVehicles = animationService.nearVehiclesSignal;
    this.nearPassengers = animationService.nearPassengersSignal;

    // Show menu when click position triggered
    effect(() => {
      this.clickPositionSignal(); // Trigger but don't use
      this.show.set(true);
      this.container()?.nativeElement.focus();
    });
  }

  onVehicleClick() {
    this.show.set(false);
  }

  ngAfterViewInit() {
    this.container()?.nativeElement.addEventListener('blur', () => {
      this.show.set(false);
    });
  }
}

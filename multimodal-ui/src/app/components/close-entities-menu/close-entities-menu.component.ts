import {
  AfterViewInit,
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  OnDestroy,
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
export class CloseEntitiesMenuComponent implements AfterViewInit, OnDestroy {
  private readonly offset = 20;
  private readonly maxHeightPadding = 100;

  private observer!: ResizeObserver;

  private clickPositionSignal: Signal<Point>;
  private heightSignal: WritableSignal<number> = signal(0);

  container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  content = viewChild.required<ElementRef<HTMLDivElement>>('content'); // To track the height

  nearVehicles: Signal<string[]>;
  nearPassengers: Signal<string[]>;

  show = signal(false);

  top = computed(() => {
    const y = this.clickPositionSignal().y;
    const height = this.heightSignal();

    if (y < window.innerHeight / 2) {
      return y - this.offset + 'px';
    } else {
      return y - height - this.offset + 'px';
    }
  });

  left = computed(() => {
    return this.clickPositionSignal().x + this.offset + 'px';
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

    // Watch element for height changes
    this.observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        this.heightSignal.set(entry.contentRect.height);
      });
    });
    this.observer.observe(this.content()?.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.observer && this.content())
      this.observer.unobserve(this.content().nativeElement);
  }
}

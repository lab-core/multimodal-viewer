import { Component, effect, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import Stats from 'stats.js';

@Component({
  selector: 'app-performance-metrics',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './performance-metrics.component.html',
  styleUrl: './performance-metrics.component.scss',
})
export class PerformanceMetricsComponent implements OnInit {
  private readonly LOCAL_STORAGE_KEY = 'multimodal.performance-metrics';
  readonly MIN_METRICS = 1;
  readonly MAX_METRICS = 3;

  isActiveSignal = signal(false);

  metricsSignal = signal<Stats[]>([]);

  constructor() {
    effect(() => {
      this.save();
    });
  }

  ngOnInit() {
    this.initialize();
    this.animate();
  }

  toggleIsActive() {
    this.isActiveSignal.update((isActive) => !isActive);
  }

  addMetric() {
    this.metricsSignal.update((metrics) => {
      const newMetric = new Stats();
      newMetric.showPanel(0);
      return [...metrics, newMetric];
    });
  }

  removeMetric() {
    this.metricsSignal.update((metrics) => {
      return [...metrics.slice(0, -1)];
    });
  }

  save() {
    const metrics = this.metricsSignal();
    const isActive = this.isActiveSignal();

    localStorage.setItem(
      this.LOCAL_STORAGE_KEY,
      JSON.stringify({ isActive, metrics: metrics.map(this.getPanelIndex) }),
    );
  }

  private initialize() {
    try {
      const savedState = localStorage.getItem(this.LOCAL_STORAGE_KEY);

      if (!savedState) {
        // No error, might be the first visit
        return;
      }

      const parsedState: unknown = JSON.parse(savedState);

      if (typeof parsedState !== 'object' || parsedState === null) {
        throw new Error('Invalid saved state: not an object', {
          cause: parsedState,
        });
      }

      if (!('isActive' in parsedState)) {
        throw new Error('Invalid saved state: missing isActive property', {
          cause: parsedState,
        });
      }

      if (typeof parsedState.isActive !== 'boolean') {
        throw new Error('Invalid saved state: isActive is not a boolean', {
          cause: parsedState,
        });
      }

      if (!('metrics' in parsedState)) {
        throw new Error('Invalid saved state: missing metrics property', {
          cause: parsedState,
        });
      }

      if (!Array.isArray(parsedState.metrics)) {
        throw new Error('Invalid saved state: metrics is not an array', {
          cause: parsedState,
        });
      }

      if (
        !parsedState.metrics.every(
          (metric: unknown) => typeof metric === 'number',
        )
      ) {
        throw new Error(
          'Invalid saved state: metrics is not an array of numbers',
          { cause: parsedState },
        );
      }

      const { isActive, metrics } = parsedState;

      this.isActiveSignal.set(isActive);
      this.metricsSignal.set(
        metrics.map((panelIndex: number) => {
          const metric = new Stats();
          metric.showPanel(panelIndex);
          return metric;
        }),
      );
    } catch (error) {
      console.error('Error initializing performance metrics:', error);
      this.addMetric();
    }
  }

  private animate() {
    const metrics = this.metricsSignal();

    metrics.forEach((metric) => metric.dom.removeAttribute('style'));

    metrics.forEach((metric) => metric.begin());

    const metricContainers = document.querySelectorAll('.metric-panel');

    metrics.forEach((metric, index) => {
      const container = metricContainers[index];

      if (container && container.innerHTML.trim() === '') {
        container.appendChild(metric.dom);
      }
    });

    requestAnimationFrame(() => {
      metrics.forEach((metric) => metric.end());
      this.animate();
    });
  }

  private getPanelIndex(this: void, metric: Stats): number {
    // Each metric has an innerHTML with all panels.
    // The one displayed has `style="display: block;"`.
    // The others have `style="display: none;"`.
    // We need to find the position of the <Stats> element with `style="display: block;"`.
    return metric.dom.innerHTML
      .split('</canvas>')
      .findIndex((panel) => panel.includes('display: block;'));
  }

  test() {
    console.log('test');
  }
}

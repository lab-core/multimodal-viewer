import { Component, signal } from '@angular/core';
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
export class PerformanceMetricsComponent {
  readonly MIN_METRICS = 1;
  readonly MAX_METRICS = 3;

  isActiveSignal = signal(false);

  metricsSignal = signal<Stats[]>([]);

  constructor() {
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
      newMetric.dom.removeAttribute('style');
      return [...metrics, newMetric];
    });
  }

  removeMetric() {
    this.metricsSignal.update((metrics) => {
      return [...metrics.slice(0, -1)];
    });
  }

  private initialize() {
    this.addMetric();
  }

  private animate() {
    const metrics = this.metricsSignal();

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
}

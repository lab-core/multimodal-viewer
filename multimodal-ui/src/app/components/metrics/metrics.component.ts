import { Component, ElementRef, Input, OnInit, OnDestroy } from '@angular/core';
import Stats from 'stats.js';

@Component({
  selector: 'app-metrics',
  imports: [],
  templateUrl: './metrics.component.html',
  styleUrl: './metrics.component.css'
})
export class MetricsComponent implements OnInit, OnDestroy {
  @Input() mode = '';
  
  private stats!: Stats;

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    this.stats = new Stats();

    if (this.mode === 'fps') this.stats.showPanel(0);
    else if (this.mode === 'ms') this.stats.showPanel(1);

    this.stats.dom.removeAttribute('style'); // Remove the position fixing

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.el.nativeElement.appendChild(this.stats.dom);
    
    this.update();
  }

  private update(): void {
    this.stats.begin();
    
    requestAnimationFrame(() => {
      this.stats.end();
      this.update();
    });
  }

  ngOnDestroy(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.el.nativeElement.removeChild(this.stats.dom);
  }
}

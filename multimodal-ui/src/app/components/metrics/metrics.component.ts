import { Component, ElementRef, Input } from '@angular/core';
import Stats from 'stats.js';

@Component({
  selector: 'app-metrics',
  imports: [],
  templateUrl: './metrics.component.html',
  styleUrl: './metrics.component.css'
})
export class MetricsComponent {
  @Input() mode: string = '';
  
  private stats!: Stats;

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    this.stats = new Stats();

    if (this.mode === 'fps') this.stats.showPanel(0);
    else if (this.mode === 'ms') this.stats.showPanel(1);

    this.stats.dom.removeAttribute('style'); // Remove the position fixing
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
    this.el.nativeElement.removeChild(this.stats.dom);
  }
}

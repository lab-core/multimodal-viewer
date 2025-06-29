import { NgTemplateOutlet } from '@angular/common';
import { Component, input, InputSignal, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import {
  BACKGROUND_SHAPE_TYPES,
  BackgroundShape,
  BackgroundShapeType,
} from '../../services/sprites.service';

@Component({
  selector: 'app-background-shape',
  imports: [NgTemplateOutlet, MatMenuModule],
  templateUrl: './background-shape.component.html',
  styleUrl: './background-shape.component.scss',
})
export class BackgroundShapeComponent {
  readonly BACKGROUND_SHAPE_TYPES = BACKGROUND_SHAPE_TYPES;

  readonly backgroundShapeInputSignal: InputSignal<BackgroundShape> =
    input.required<BackgroundShape>({ alias: 'backgroundShape' });

  readonly shapeOutputEmitter = output<BackgroundShapeType>({
    alias: 'shapeChange',
  });
}

import { Component, input, InputSignal } from '@angular/core';

@Component({
  selector: 'app-entity-name',
  imports: [],
  templateUrl: './entity-name.component.html',
  styleUrl: './entity-name.component.scss',
})
export class EntityNameComponent {
  readonly nameInputSignal: InputSignal<string | null | undefined> =
    input.required<string | null | undefined>({ alias: 'name' });

  readonly tagsInputSignal: InputSignal<string[] | undefined> = input.required<
    string[] | undefined
  >({
    alias: 'tags',
  });
}

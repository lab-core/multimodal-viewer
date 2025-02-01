import { Component, computed, Signal } from '@angular/core';
import { UserInterfaceService } from '../../services/user-interface.service';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-user-interface',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './user-interface.component.html',
  styleUrl: './user-interface.component.css',
})
export class UserInterfaceComponent {
  constructor(
    private readonly userInterfaceService: UserInterfaceService,
    private readonly matDialog: MatDialog
  ) {}

  get shouldShowMainMenuSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowMainMenuSignal;
  }

  get shouldDimMapSignal(): Signal<boolean> {
    return computed(() => this.shouldShowMainMenuSignal());
  }
}

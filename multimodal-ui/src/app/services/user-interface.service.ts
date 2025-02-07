import { Injectable, Signal, signal, WritableSignal } from '@angular/core';

/**
 * Allows to save the state of the user interface even when the component is destroyed.
 */
@Injectable({
  providedIn: 'root',
})
export class UserInterfaceService {
  private readonly _shouldShowInformationPanelSignal: WritableSignal<boolean> =
    signal<boolean>(false);

  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return this._shouldShowInformationPanelSignal;
  }

  showInformationPanel() {
    this._shouldShowInformationPanelSignal.set(true);
  }

  hideInformationPanel() {
    this._shouldShowInformationPanelSignal.set(false);
  }
}

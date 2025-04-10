import {
  computed,
  Injectable,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';

export interface HistoryItem {
  id: string;
  name: string;
  type: 'vehicle' | 'passenger' | 'stop';
}

@Injectable({
  providedIn: 'root',
})
export class ClickHistoryService {
  private _clickhistory: WritableSignal<HistoryItem[]> = signal([]);

  clickHistory: Signal<HistoryItem[]> = computed(() => {
    return this._clickhistory();
  });

  addHistory(id: string, name: string) {
    this._clickhistory.update((clickHistory) => {
      const index = clickHistory.findIndex((item) => item.id === id);
      if (index !== -1) clickHistory.splice(index, 1);
      return [{ id, name, type: 'vehicle' }, ...clickHistory];
    });
  }

  clearHistory() {
    this._clickhistory.set([]);
  }
}

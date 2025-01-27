import { effect, Injectable, Signal, signal } from '@angular/core';
import { Socket } from 'ngx-socket-io';

@Injectable()
export class CommunicationService {
  private readonly _isConnectedSignal = signal(false);

  constructor(private readonly socket: Socket) {
    effect(() => {
      if (this._isConnectedSignal()) {
        console.log('Connected to server');
      } else {
        console.log('Disconnected from server');
      }

      this.socket.on('connect', () => {
        this._isConnectedSignal.set(true);
      });

      this.socket.on('disconnect', () => {
        this._isConnectedSignal.set(false);
      });
    });
  }

  get isConnectedSignal(): Signal<boolean> {
    return this._isConnectedSignal;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, ...args: any[]): void {
    this.socket.emit('client/' + event, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): void {
    this.socket.on('client/' + event, listener);
  }
}

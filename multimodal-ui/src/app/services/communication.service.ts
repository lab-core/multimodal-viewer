import { effect, Injectable, Signal, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class CommunicationService {
  private readonly socket: Socket;

  private readonly HOST = '127.0.0.1';
  private readonly PORT = '5000';
  private readonly URL = `http://${this.HOST}:${this.PORT}`;

  private readonly _isConnectedSignal = signal(false);

  constructor() {
    this.socket = io(this.URL, {
      // To notify the server that this is a client
      auth: 'client' as unknown as undefined,
    });

    this.connect();

    effect(() => {
      if (this._isConnectedSignal()) {
        console.log('Connected to server');
      } else {
        console.log('Disconnected from server');
      }
    });
  }

  get isConnectedSignal(): Signal<boolean> {
    return this._isConnectedSignal;
  }

  emit(event: string): void;
  emit<T>(event: string, data: T): void;
  emit<T>(event: string, data?: T): void {
    if (this.socket) {
      if (data === undefined) {
        this.socket.emit(event);
        return;
      }
      this.socket.emit(event, data);
    }
  }

  on(event: string, callback: () => void): void;
  on<T>(event: string, callback: (data: T) => void): void;
  on<T>(event: string, callback: (data?: T) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  private connect(): void {
    this.socket.connect();
    this.socket.removeAllListeners();

    this.on<void>('connect', () => {
      this._isConnectedSignal.set(true);
    });

    this.on<void>('disconnect', () => {
      this._isConnectedSignal.set(false);
    });
  }
}

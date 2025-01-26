import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class CommunicationService {
  private socket: Socket | null = null;
  private readonly HOST = '127.0.0.1';
  private readonly PORT = '5000';
  private readonly URL = `http://${this.HOST}:${this.PORT}`;

  constructor() {
    this.connect();
  }

  connect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(this.URL);

    this.on<void>('connect', () => {
      console.log('Connected to server');
    });

    this.on<void>('disconnect', () => {
      console.log('Disconnected from server');
    });
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

  on<T>(event: string, callback: (data: T) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

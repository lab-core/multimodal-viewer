import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';

import { SocketIoConfig, SocketIoModule } from 'ngx-socket-io';
import { routes } from './app.routes';

const config: SocketIoConfig = {
  url: 'http://127.0.0.1:8090',
  options: { auth: { type: 'client' } },
};

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(SocketIoModule.forRoot(config)),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
  ],
};

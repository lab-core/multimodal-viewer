import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { VisualizerComponent } from './components/visualizer/visualizer.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'visualize/:simulationId', component: VisualizerComponent },
  { path: '**', redirectTo: 'home' },
];

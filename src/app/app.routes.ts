import { Routes } from '@angular/router';
import { SolarSystemComponent } from './components/solar-system/solar-system.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', component: SolarSystemComponent },
];

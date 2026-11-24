import { Injectable } from '@angular/core';
import { Planet } from '../models/interface/planet';

@Injectable({ providedIn: 'root' })
export class PlanetService {
  getPlanets(): Planet[] {
    return [
      {
        id: 'ares-2', name: 'Арес-2', radius: 3389, distanceFromSun: 0.65, orbitalPeriod: 191,
        mass: 0.107, gravity: 3.71, athmosphere: false,
        resourses: { water: 8, minerals: 94, gas: 12 },
      },
      {
        id: 'terra-3', name: 'Терра-3', radius: 6371, distanceFromSun: 1, orbitalPeriod: 365,
        mass: 1, gravity: 9.81, athmosphere: true,
        resourses: { water: 92, minerals: 84, gas: 35 },
      },
      {
        id: 'boreya-4', name: 'Борея-4', radius: 8500, distanceFromSun: 1.6, orbitalPeriod: 739,
        mass: 2.4, gravity: 13.2, athmosphere: true,
        resourses: { water: 65, minerals: 42, gas: 88 },
      },
    ];
  }
}

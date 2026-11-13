import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { BUILDING_CATALOGUE, BUILDINGS_BY_TYPE } from '../domain/building-catalogue';
import { buildProblem } from '../domain/building-rules';
import {
  advanceColony,
  createColony,
  freezeColony,
  gridSize,
  productionYield,
  PRODUCTION_INTERVAL_MS,
} from '../domain/colony-simulation';
import {
  BuildError,
  BuildingDefinition,
  BuildingType,
  Colony,
  PlacedBuilding,
} from '../models/interface/colony';
import { Planet } from '../models/interface/planet';

@Injectable({ providedIn: 'root' })
export class ColonyService {
  private readonly creditsState = signal(2000);
  private readonly coloniesState = signal<Readonly<Record<string, Colony>>>(Object.freeze({}));
  private readonly clockState = signal(Date.now());
  private lastTick = this.clockState();
  private nextId = 1;

  readonly credits = this.creditsState.asReadonly();
  readonly colonies = this.coloniesState.asReadonly();
  readonly clock = this.clockState.asReadonly();
  readonly catalogue = BUILDING_CATALOGUE;
  readonly gridSize = gridSize;
  readonly yieldFor = productionYield;

  constructor() {
    const timer = setInterval(() => this.tick(Date.now()), PRODUCTION_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  openPlanet(planet: Planet): void {
    this.tick(Date.now());
    if (this.colonies()[planet.id]) return;
    this.coloniesState.update((colonies) =>
      Object.freeze({ ...colonies, [planet.id]: createColony(planet) }),
    );
  }

  definition(type: BuildingType): BuildingDefinition {
    return BUILDINGS_BY_TYPE[type];
  }

  buildProblem(planet: Planet, type: BuildingType): BuildError | null {
    return buildProblem(this.colonies()[planet.id], this.credits(), this.definition(type));
  }

  build(planet: Planet, type: BuildingType, tile: number): BuildError | null {
    this.tick(Date.now());
    const problem = this.buildProblem(planet, type);
    if (problem) return problem;
    const colony = this.colonies()[planet.id];
    if (!Number.isInteger(tile) || tile < 0 || tile >= gridSize(colony.planet.radius) ** 2)
      return 'invalid-tile';
    if (colony.buildings.some((building) => building.tile === tile)) return 'occupied';
    const definition = this.definition(type);
    const now = this.clock();
    const building: PlacedBuilding = {
      id: this.nextId++,
      type,
      tile,
      startedAt: now,
      completesAt: now + definition.buildTime * 1000,
      completed: false,
      status: 'construction',
    };
    const next = freezeColony({
      ...colony,
      stocks: {
        ...colony.stocks,
        minerals: colony.stocks.minerals - definition.costMinerals,
        water: colony.stocks.water - definition.costWater,
        gas: colony.stocks.gas - definition.costGas,
        energy: colony.stocks.energy - definition.costEnergy,
      },
      buildings: [...colony.buildings, building],
    });
    this.creditsState.update((credits) => credits - definition.costCredits);
    this.coloniesState.update((colonies) => Object.freeze({ ...colonies, [planet.id]: next }));
    return null;
  }

  tick(now: number): void {
    const effectiveNow = Math.max(now, this.clock());
    let colonies = this.colonies();
    while (this.lastTick + PRODUCTION_INTERVAL_MS <= effectiveNow) {
      this.lastTick += PRODUCTION_INTERVAL_MS;
      colonies = Object.fromEntries(
        Object.entries(colonies).map(([id, colony]) => [id, advanceColony(colony, this.lastTick)]),
      );
    }
    this.coloniesState.set(Object.freeze(colonies));
    this.clockState.set(effectiveNow);
  }
}

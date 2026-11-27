import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import * as BuildingCatalogue from '../../planet/domain/building-catalogue';
import * as BuildingRules from '../../planet/domain/building-rules';
import * as DemolitionRules from '../../planet/domain/demolition-rules';
import * as GameSaveValidation from '../../game-save/domain/game-save-validation';
import * as ColonySimulation from '../../planet/domain/colony-simulation';
import { BuildError } from '../../planet/models/enum/build-error';
import { BuildingOperationError } from '../../planet/models/enum/building-operation-error';
import { BuildingStatus } from '../../planet/models/enum/building-status';
import { BuildingType } from '../../planet/models/enum/building-type';
import { DemolitionError } from '../../planet/models/enum/demolition-error';
import { BuildingDefinition } from '../../planet/models/interface/building-definition';
import { Colony } from '../../planet/models/interface/colony';
import { GAME_SAVE_VERSION, GameSave } from '../../game-save/models/interface/game-save';
import { PlacedBuilding } from '../../planet/models/interface/placed-building';
import { Planet } from '../../shared/models/interface/planet';
import { PlanetService } from '../../shared/services/planet.service';
import * as ColonyFinance from '../../planet/domain/colony-finances';
import * as SessionMaintenance from '../domain/session-maintenance';

interface SessionState {
  readonly credits: number;
  readonly creditRemainder: number;
  readonly maintenanceShortfall: number;
  readonly planets: readonly Colony['planet'][];
  readonly colonies: Readonly<Record<string, Colony>>;
  readonly gameTime: number;
  readonly lastProductionTick: number;
  readonly nextBuildingId: number;
  readonly manualPaused: boolean;
}

@Injectable({ providedIn: 'root' })
export class GameSessionService {
  private readonly document = inject(DOCUMENT);
  private readonly planetFactory = inject(PlanetService);
  private readonly sessionState = signal(this.initialSession());
  private readonly hiddenState = signal(this.document.visibilityState === 'hidden');
  private readonly systemPausedState = signal(true);
  private lastSample = performance.now();

  readonly credits = computed(
    () => this.sessionState().credits + this.sessionState().creditRemainder / 100,
  );
  readonly wholeCredits = computed(() => this.sessionState().credits);
  readonly creditRemainder = computed(() => this.sessionState().creditRemainder);
  readonly maintenanceShortfall = computed(() => this.sessionState().maintenanceShortfall / 100);
  readonly finances = computed(() => ColonyFinance.sessionFinances(Object.values(this.colonies())));
  readonly colonyFinances = computed(
    () => this.finances().colonies,
  );
  readonly planets = computed(() => this.sessionState().planets);
  readonly colonies = computed(() => this.sessionState().colonies);
  readonly clock = computed(() => this.sessionState().gameTime);
  readonly manualPaused = computed(() => this.sessionState().manualPaused);
  readonly tabHidden = this.hiddenState.asReadonly();
  readonly systemPaused = this.systemPausedState.asReadonly();
  readonly paused = computed(() => this.manualPaused() || this.tabHidden() || this.systemPaused());
  readonly catalogue = BuildingCatalogue.BUILDING_CATALOGUE;
  readonly gridSize = ColonySimulation.gridSize;
  readonly yieldFor = ColonySimulation.productionYield;

  constructor() {
    const timer = setInterval(() => this.tick(), ColonySimulation.PRODUCTION_INTERVAL_MS);
    const visibilityChanged = () => {
      this.tick();
      this.hiddenState.set(this.document.visibilityState === 'hidden');
    };
    this.document.addEventListener('visibilitychange', visibilityChanged);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', visibilityChanged);
    });
  }

  setManualPaused(paused: boolean): void {
    this.tick();
    this.sessionState.update((state) => ({ ...state, manualPaused: paused }));
  }

  setSystemPaused(paused: boolean): void {
    this.tick();
    this.systemPausedState.set(paused);
  }

  private initialSession(): SessionState {
    return {
      credits: 2000,
      creditRemainder: 0,
      maintenanceShortfall: 0,
      planets: Object.freeze(this.planetFactory.getPlanets().map(ColonySimulation.freezePlanet)),
      colonies: Object.freeze({}),
      gameTime: 0,
      lastProductionTick: 0,
      nextBuildingId: 1,
      manualPaused: false,
    };
  }

  resetSession(): void {
    const wasSystemPaused = this.systemPaused();
    this.setSystemPaused(true);
    try {
      this.sessionState.set(this.initialSession());
    } finally {
      this.lastSample = performance.now();
      this.hiddenState.set(this.document.visibilityState === 'hidden');
      this.systemPausedState.set(wasSystemPaused);
    }
  }

  createSave(savedAt: Date): GameSave {
    const timestamp = savedAt.toISOString();
    this.tick();
    const state = this.sessionState();
    const colonies = Object.values(state.colonies);
    return {
      version: GAME_SAVE_VERSION,
      savedAt: timestamp,
      gameTime: state.gameTime,
      lastProductionTick: state.lastProductionTick,
      credits: state.credits,
      creditRemainder: state.creditRemainder,
      maintenanceShortfall: state.maintenanceShortfall,
      planets: state.planets.map((planet) => ({
        id: planet.id,
        name: planet.name,
        radius: planet.radius,
        distanceFromSun: planet.distanceFromSun,
        orbitalPeriod: planet.orbitalPeriod,
        mass: planet.mass,
        gravity: planet.gravity,
        athmosphere: planet.athmosphere,
        resourses: {
          water: planet.resourses.water,
          minerals: planet.resourses.minerals,
          gas: planet.resourses.gas,
        },
      })),
      colonies: colonies.map((colony) => ({
        planetId: colony.planet.id,
        stocks: {
          minerals: colony.stocks.minerals,
          water: colony.stocks.water,
          food: colony.stocks.food,
          gas: colony.stocks.gas,
          population: colony.stocks.population,
        },
        deposits: { minerals: colony.deposits.minerals, gas: colony.deposits.gas },
        buildings: colony.buildings.map((building) => ({
          id: building.id,
          type: building.type,
          tile: building.tile,
          startedAt: building.startedAt,
          completesAt: building.completesAt,
          completed: building.completed,
          enabled: building.enabled,
          disabledByFinance: building.disabledByFinance ?? false,
        })),
      })),
      nextBuildingId: state.nextBuildingId,
      manualPaused: state.manualPaused,
    };
  }

  restoreSave(input: unknown): void {
    const save = GameSaveValidation.readGameSave(input);
    const wasSystemPaused = this.systemPaused();
    this.setSystemPaused(true);
    try {
      const planets = Object.freeze(save.planets.map(ColonySimulation.freezePlanet));
      const byId = new Map(planets.map((planet) => [planet.id, planet]));
      const colonies: Record<string, Colony> = {};
      for (const saved of save.colonies) {
        const planet = byId.get(saved.planetId);
        if (!planet) throw new Error(`Missing validated planet: ${saved.planetId}`);
        const colony = ColonySimulation.recalculateColony({
          planet,
          stocks: {
            minerals: saved.stocks.minerals,
            water: saved.stocks.water,
            food: saved.stocks.food,
            gas: saved.stocks.gas,
            population: saved.stocks.population,
            energy: 0,
            populationCapacity: 0,
          },
          deposits: { minerals: saved.deposits.minerals, gas: saved.deposits.gas },
          buildings: saved.buildings.map((building) => ({
            id: building.id,
            type: building.type,
            tile: building.tile,
            startedAt: building.startedAt,
            completesAt: building.completesAt,
            completed: building.completed,
            enabled: building.enabled,
            disabledByFinance: building.disabledByFinance,
            status: BuildingStatus.Working,
          })),
        });
        Object.defineProperty(colonies, saved.planetId, { value: colony, enumerable: true });
      }
      this.sessionState.set({
        credits: save.credits,
        creditRemainder: save.creditRemainder,
        maintenanceShortfall: save.maintenanceShortfall,
        planets,
        colonies: Object.freeze(colonies),
        gameTime: save.gameTime,
        lastProductionTick: save.lastProductionTick,
        nextBuildingId: save.nextBuildingId,
        manualPaused: save.manualPaused,
      });
    } finally {
      this.lastSample = performance.now();
      this.hiddenState.set(this.document.visibilityState === 'hidden');
      this.systemPausedState.set(wasSystemPaused);
    }
  }

  openPlanet(planet: Planet): void {
    this.tick();
    if (this.colonies()[planet.id]) return;
    const state = this.sessionState();
    const source = state.planets.find((known) => known.id === planet.id) ?? ColonySimulation.freezePlanet(planet);
    const colony = ColonySimulation.createColony(source);
    this.sessionState.set({
      ...state,
      planets: state.planets.includes(source)
        ? state.planets
        : Object.freeze([...state.planets, source]),
      colonies: Object.freeze({ ...state.colonies, [planet.id]: colony }),
    });
  }

  definition(type: BuildingType): BuildingDefinition {
    return BuildingCatalogue.BUILDINGS_BY_TYPE[type];
  }

  buildProblem(planet: Planet, type: BuildingType): BuildError | null {
    if (this.paused()) return BuildError.Paused;
    if (!Number.isSafeInteger(this.sessionState().nextBuildingId + 1))
      return BuildError.IdExhausted;
    return BuildingRules.buildProblem(
      this.colonies()[planet.id],
      this.sessionState().credits,
      this.definition(type),
    );
  }

  build(planet: Planet, type: BuildingType, tile: number): BuildError | null {
    this.tick();
    const problem = this.buildProblem(planet, type);
    if (problem) return problem;
    const colony = this.colonies()[planet.id];
    if (!Number.isInteger(tile) || tile < 0 || tile >= ColonySimulation.gridSize(colony.planet.radius) ** 2)
      return BuildError.InvalidTile;
    if (colony.buildings.some((building) => building.tile === tile)) return BuildError.Occupied;
    const definition = this.definition(type);
    const now = this.clock();
    const state = this.sessionState();
    const building: PlacedBuilding = {
      id: state.nextBuildingId,
      type,
      tile,
      startedAt: now,
      completesAt: now + definition.buildTime * 1000,
      completed: false,
      enabled: true,
      disabledByFinance: false,
      status: BuildingStatus.Construction,
    };
    const next = ColonySimulation.freezeColony(
      ColonySimulation.recalculateColonyWorkforce({
        ...colony,
        stocks: {
          ...colony.stocks,
          minerals: colony.stocks.minerals - definition.costMinerals,
          water: Math.round((colony.stocks.water - definition.costWater) * 10) / 10,
          gas: colony.stocks.gas - definition.costGas,
        },
        buildings: [...colony.buildings, building],
      }),
    );
    this.sessionState.set({
      ...state,
      credits: state.credits - definition.costCredits,
      nextBuildingId: state.nextBuildingId + 1,
      colonies: Object.freeze({ ...state.colonies, [planet.id]: next }),
    });
    return null;
  }

  demolitionProblem(planet: Planet, buildingId: number): DemolitionError | null {
    if (this.paused()) return DemolitionError.Paused;
    return DemolitionRules.demolitionProblem(this.colonies()[planet.id], buildingId);
  }

  toggleBuilding(planet: Planet, buildingId: number): BuildingOperationError | null {
    const before = this.colonies()[planet.id]?.buildings.find((placed) => placed.id === buildingId);
    this.tick();
    if (this.paused()) return BuildingOperationError.Paused;
    const colony = this.colonies()[planet.id];
    if (!colony) return BuildingOperationError.ColonyMissing;
    const building = colony.buildings.find((placed) => placed.id === buildingId);
    if (!building || !before) return BuildingOperationError.BuildingMissing;
    if (building.type === BuildingType.Base || building.type === BuildingType.Housing)
      return BuildingOperationError.Protected;
    if (!building.completed) return BuildingOperationError.Construction;
    const next = ColonySimulation.freezeColony(
      ColonySimulation.recalculateColonyWorkforce({
        ...colony,
        buildings: colony.buildings.map((placed) =>
          placed.id === buildingId
            ? { ...placed, enabled: !before.enabled, disabledByFinance: false }
            : placed,
        ),
      }),
    );
    this.sessionState.update((state) => ({
      ...state,
      colonies: Object.freeze({ ...state.colonies, [planet.id]: next }),
    }));
    return null;
  }

  demolish(planet: Planet, buildingId: number): DemolitionError | null {
    this.tick();
    const problem = this.demolitionProblem(planet, buildingId);
    if (problem) return problem;
    const colony = this.colonies()[planet.id];
    const building = colony.buildings.find((building) => building.id === buildingId);
    if (!building) return DemolitionError.BuildingMissing;
    const stocks = { ...colony.stocks };
    this.definition(building.type).demolish(stocks, building.completed);
    const next = ColonySimulation.freezeColony(
      ColonySimulation.recalculateColonyWorkforce({
        ...colony,
        stocks,
        buildings: colony.buildings.filter((placed) => placed.id !== buildingId),
      }),
    );
    this.sessionState.update((state) => ({
      ...state,
      colonies: Object.freeze({ ...state.colonies, [planet.id]: next }),
    }));
    return null;
  }

  tick(): void {
    const now = Math.max(performance.now(), this.lastSample);
    const elapsed = now - this.lastSample;
    this.lastSample = now;
    if (this.paused()) return;
    const state = this.sessionState();
    const effectiveNow = state.gameTime + elapsed;
    let colonies = state.colonies;
    let lastTick = state.lastProductionTick;
    let ledger = {
      credits: state.credits,
      creditRemainder: state.creditRemainder,
      maintenanceShortfall: state.maintenanceShortfall,
    };
    while (lastTick + ColonySimulation.PRODUCTION_INTERVAL_MS <= effectiveNow) {
      lastTick += ColonySimulation.PRODUCTION_INTERVAL_MS;
      const step = SessionMaintenance.applySessionMaintenance(Object.values(colonies), ledger.credits, ledger.creditRemainder);
      ledger = {
        credits: step.credits,
        creditRemainder: step.creditRemainder,
        maintenanceShortfall: step.maintenanceShortfall,
      };
      colonies = Object.fromEntries(
        step.colonies.map((colony) => [colony.planet.id, ColonySimulation.advanceColony(colony, lastTick)]),
      );
    }
    this.sessionState.set({
      ...state,
      ...ledger,
      colonies: Object.freeze(colonies),
      gameTime: effectiveNow,
      lastProductionTick: lastTick,
    });
  }
}

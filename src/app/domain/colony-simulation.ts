import {
  BuildingDefinition,
  BuildingStatus,
  Colony,
  PlanetStockpile,
} from '../models/interface/colony';
import { Planet } from '../models/interface/planet';
import { BUILDINGS_BY_TYPE } from './building-catalogue';

export const PRODUCTION_INTERVAL_MS = 2000;

export function gridSize(radius: number): number {
  return Math.max(5, Math.min(15, Math.round(radius / 1000) + 3));
}

export function productionYield(planet: Colony['planet'], definition: BuildingDefinition): number {
  if (definition.production === 'energy') return definition.productionAmount;
  if (!definition.production) return 0;
  return Math.ceil((planet.resourses[definition.production] / 100) * definition.productionAmount);
}

export function freezeColony(colony: Colony): Colony {
  return Object.freeze({
    ...colony,
    planet: Object.freeze({
      ...colony.planet,
      resourses: Object.freeze({ ...colony.planet.resourses }),
    }),
    stocks: Object.freeze({ ...colony.stocks }),
    deposits: Object.freeze({ ...colony.deposits }),
    buildings: Object.freeze(colony.buildings.map((building) => Object.freeze({ ...building }))),
  });
}

export function createColony(planet: Planet): Colony {
  return freezeColony({
    planet,
    stocks: { minerals: 240, water: 160, gas: 120, energy: 100, population: 0 },
    deposits: { minerals: planet.resourses.minerals * 1000, gas: planet.resourses.gas * 1000 },
    buildings: [],
  });
}

export function advanceColony(colony: Colony, now: number): Colony {
  if (!colony.buildings.length) return colony;
  const stocks = { ...colony.stocks };
  const deposits = { ...colony.deposits };
  const statuses = new Map<number, BuildingStatus>();
  const active = colony.buildings
    .filter((building) => building.completed)
    .sort((first, second) => {
      const firstGenerator = BUILDINGS_BY_TYPE[first.type].production === 'energy';
      const secondGenerator = BUILDINGS_BY_TYPE[second.type].production === 'energy';
      return Number(secondGenerator) - Number(firstGenerator) || first.id - second.id;
    });
  active.forEach((building) => {
    statuses.set(
      building.id,
      produce(colony.planet, stocks, deposits, BUILDINGS_BY_TYPE[building.type]),
    );
  });
  const buildings = colony.buildings.map((building) => {
    if (!building.completed && now >= building.completesAt) {
      stocks.population += BUILDINGS_BY_TYPE[building.type].populationGain;
      return { ...building, completed: true, status: 'working' as const };
    }
    return { ...building, status: statuses.get(building.id) ?? building.status };
  });
  return freezeColony({ ...colony, stocks, deposits, buildings });
}

function produce(
  planet: Colony['planet'],
  stocks: PlanetStockpile,
  deposits: { minerals: number; gas: number },
  definition: BuildingDefinition,
): BuildingStatus {
  const resource = definition.production;
  if (!resource) return 'working';
  const amount = productionYield(planet, definition);
  const extracted =
    resource === 'minerals' || resource === 'gas' ? Math.min(amount, deposits[resource]) : amount;
  if (extracted === 0) return 'depleted';
  if (stocks.energy < definition.energyUse) return 'no-energy';
  stocks.energy -= definition.energyUse;
  stocks[resource] += extracted;
  if (resource === 'minerals' || resource === 'gas') deposits[resource] -= extracted;
  return 'working';
}

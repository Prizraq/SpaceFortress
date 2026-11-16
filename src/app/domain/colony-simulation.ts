import { BuildingStatus } from '../models/enum/building-status';
import { ProducedResource } from '../models/enum/produced-resource';
import { BuildingDefinition } from '../models/interface/building-definition';
import { Colony } from '../models/interface/colony';
import { PlanetStockpile } from '../models/interface/planet-stockpile';
import { Planet } from '../models/interface/planet';
import { BUILDINGS_BY_TYPE } from './building-catalogue';

export const PRODUCTION_INTERVAL_MS = 2000;

export function gridSize(radius: number): number {
  return Math.max(5, Math.min(15, Math.round(radius / 1000) + 3));
}

export function productionYield(planet: Colony['planet'], definition: BuildingDefinition): number {
  return definition.yieldFor(planet);
}

export function populationWaterDemand(population: number): number {
  return population / 10;
}

export function populationFoodDemand(population: number): number {
  return population / 5;
}

export function foodEconomy(colony: Colony) {
  const stocks = { ...colony.stocks };
  const { foodProduction } = runLifeSupport(
    colony,
    stocks,
    { ...colony.deposits },
    new Map<number, BuildingStatus>(),
  );
  const consumption = populationFoodDemand(colony.stocks.population);
  return {
    production: foodProduction,
    consumption,
    balance: Math.round((foodProduction - consumption) * 10) / 10,
  };
}

export function waterEconomy(colony: Colony) {
  let production = 0;
  let consumption = populationWaterDemand(colony.stocks.population);
  const populationDemand = consumption;
  for (const building of colony.buildings) {
    if (!building.completed) continue;
    const definition = BUILDINGS_BY_TYPE[building.type];
    production += definition.waterSupply;
    const amount = definition.availableYield(colony.planet, colony.deposits);
    if (definition.production === ProducedResource.Water) production += amount;
    if (amount > 0) consumption += definition.waterUse;
  }
  return {
    production,
    consumption,
    balance: Math.round((production - consumption) * 10) / 10,
    populationSupplied: colony.stocks.water + production >= populationDemand,
  };
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
    stocks: {
      minerals: 240,
      water: 160,
      food: 100,
      gas: 120,
      energy: 0,
      population: 0,
      populationCapacity: 0,
    },
    deposits: { minerals: planet.resourses.minerals * 1000, gas: planet.resourses.gas * 1000 },
    buildings: [],
  });
}

export function advanceColony(colony: Colony, now: number): Colony {
  if (!colony.buildings.length) return colony;
  const stocks = { ...colony.stocks };
  const deposits = { ...colony.deposits };
  const statuses = new Map<number, BuildingStatus>();
  const { active, waterSupplied, foodProduction } = runLifeSupport(
    colony,
    stocks,
    deposits,
    statuses,
  );
  const foodSupplied = stocks.food >= populationFoodDemand(stocks.population);
  stocks.food = Math.max(0, Math.round(stocks.food * 10) - stocks.population * 2) / 10;
  if (!foodSupplied || stocks.population > stocks.populationCapacity) {
    stocks.population = Math.max(0, stocks.population - 1);
  } else if (
    waterSupplied &&
    (stocks.food > 0 || foodProduction >= populationFoodDemand(stocks.population + 1))
  ) {
    stocks.population = Math.min(stocks.populationCapacity, stocks.population + 1);
  }
  for (const building of active) {
    const definition = BUILDINGS_BY_TYPE[building.type];
    if (
      definition.production === ProducedResource.Water ||
      definition.production === ProducedResource.Food
    )
      continue;
    statuses.set(building.id, definition.produce(colony.planet, stocks, deposits));
  }
  const buildings = colony.buildings.map((building) => {
    if (!building.completed && now >= building.completesAt) {
      BUILDINGS_BY_TYPE[building.type].complete(colony.planet, stocks);
      return { ...building, completed: true, status: BuildingStatus.Working };
    }
    return { ...building, status: statuses.get(building.id) ?? building.status };
  });
  return freezeColony({ ...colony, stocks, deposits, buildings });
}

function runLifeSupport(
  colony: Colony,
  stocks: PlanetStockpile,
  deposits: Pick<PlanetStockpile, 'minerals' | 'gas'>,
  statuses: Map<number, BuildingStatus>,
) {
  const active = colony.buildings
    .filter((building) => building.completed)
    .sort((first, second) => first.id - second.id);
  const initialFood = stocks.food;
  for (const building of active) {
    BUILDINGS_BY_TYPE[building.type].provideLifeSupport(stocks);
  }
  for (const building of active) {
    const definition = BUILDINGS_BY_TYPE[building.type];
    if (definition.production !== ProducedResource.Water) continue;
    statuses.set(building.id, definition.produce(colony.planet, stocks, deposits));
  }
  const waterSupplied = stocks.water >= populationWaterDemand(stocks.population);
  // Keep tenths exact so repeated consumption cannot leave floating-point residue.
  stocks.water = Math.max(0, Math.round(stocks.water * 10) - stocks.population) / 10;
  for (const building of active) {
    const definition = BUILDINGS_BY_TYPE[building.type];
    if (definition.production !== ProducedResource.Food) continue;
    statuses.set(building.id, definition.produce(colony.planet, stocks, deposits));
  }
  return {
    active,
    waterSupplied,
    foodProduction: Math.round((stocks.food - initialFood) * 10) / 10,
  };
}

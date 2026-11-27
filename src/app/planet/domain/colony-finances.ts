import { BuildingType } from '../models/enum/building-type';
import { Colony } from '../models/interface/colony';
import { PlacedBuilding } from '../models/interface/placed-building';
import * as BuildingCatalogue from './building-catalogue';
import * as ColonySimulation from './colony-simulation';

export const TAX_PER_RESIDENT_PER_MINUTE = 6;
const TAX_PER_RESIDENT_PER_STEP_CENTS =
  (TAX_PER_RESIDENT_PER_MINUTE * ColonySimulation.PRODUCTION_INTERVAL_MS) / 600;

export function maintenancePerMinute(type: BuildingType): number {
  return BuildingCatalogue.BUILDINGS_BY_TYPE[type].maintenancePerMinute;
}

export function buildingMaintenancePerMinute(building: PlacedBuilding): number {
  return building.completed && building.enabled ? maintenancePerMinute(building.type) : 0;
}

export function creditDepletionSeconds(credits: number, balancePerMinute: number): number | null {
  return balancePerMinute < 0 ? Math.ceil((credits / -balancePerMinute) * 60) : null;
}

export function colonyFinances(colony: Colony) {
  const income = colony.stocks.population * TAX_PER_RESIDENT_PER_MINUTE;
  const incomeCentsPerStep = colony.stocks.population * TAX_PER_RESIDENT_PER_STEP_CENTS;
  const buildings = colony.buildings.map((building) => {
    const maintenance = buildingMaintenancePerMinute(building);
    return {
      buildingId: building.id,
      type: building.type,
      maintenance,
      maintenanceCentsPerStep: (maintenance * ColonySimulation.PRODUCTION_INTERVAL_MS) / 600,
    };
  });
  const maintenance = buildings.reduce((total, building) => total + building.maintenance, 0);
  const maintenanceCentsPerStep = buildings.reduce(
    (total, building) => total + building.maintenanceCentsPerStep,
    0,
  );
  return {
    income,
    incomeCentsPerStep,
    buildings,
    maintenance,
    maintenanceCentsPerStep,
    balance: income - maintenance,
  };
}

export function sessionFinances(colonies: readonly Colony[]) {
  const contributions = colonies.map((colony) => ({
    planetId: colony.planet.id,
    name: colony.planet.name,
    ...colonyFinances(colony),
  }));
  const income = contributions.reduce((total, colony) => total + colony.income, 0);
  const incomeCentsPerStep = contributions.reduce(
    (total, colony) => total + colony.incomeCentsPerStep,
    0,
  );
  const maintenance = contributions.reduce((total, colony) => total + colony.maintenance, 0);
  const maintenanceCentsPerStep = contributions.reduce(
    (total, colony) => total + colony.maintenanceCentsPerStep,
    0,
  );
  return {
    colonies: contributions,
    income,
    incomeCentsPerStep,
    maintenance,
    maintenanceCentsPerStep,
    balance: income - maintenance,
  };
}

import { BuildingStatus } from '../models/enum/building-status';
import { Colony } from '../models/interface/colony';
import { PlacedBuilding } from '../models/interface/placed-building';
import { BUILDINGS_BY_TYPE } from './building-catalogue';

export function allocateWorkers(colony: Colony): ReadonlyMap<number, number> {
  let available = colony.stocks.population;
  const workers = new Map<number, number>();
  for (const building of [...colony.buildings].sort((a, b) => a.id - b.id)) {
    const assigned =
      building.completed && building.enabled
        ? Math.min(available, BUILDINGS_BY_TYPE[building.type].workersRequired)
        : 0;
    workers.set(building.id, assigned);
    available -= assigned;
  }
  return workers;
}

export function colonyWorkforce(colony: Colony) {
  const workers = allocateWorkers(colony);
  const staffing = (building: PlacedBuilding): number => {
    if (!building.completed || !building.enabled) return 0;
    const required = BUILDINGS_BY_TYPE[building.type].workersRequired;
    return required === 0 ? 1 : (workers.get(building.id) ?? 0) / required;
  };
  let capacity = 0;
  let reserved = 0;
  let constructionEnergy = 0;
  for (const building of colony.buildings) {
    if (!building.enabled) continue;
    const definition = BUILDINGS_BY_TYPE[building.type];
    capacity += definition.energyGainFor(colony.planet) * staffing(building);
    reserved += definition.costEnergy;
    if (!building.completed) constructionEnergy += definition.costEnergy;
  }
  let remaining = capacity - constructionEnergy;
  let overloaded = false;
  const powered = new Set<number>();
  for (const building of [...colony.buildings].sort((a, b) => a.id - b.id)) {
    if (!building.completed || !building.enabled) continue;
    const cost = BUILDINGS_BY_TYPE[building.type].costEnergy;
    if (cost === 0) {
      powered.add(building.id);
    } else if (!overloaded && remaining >= cost) {
      powered.add(building.id);
      remaining -= cost;
    } else {
      overloaded = true;
    }
  }
  const efficiency = (building: PlacedBuilding): number =>
    powered.has(building.id) ? staffing(building) : 0;
  const status = (building: PlacedBuilding): BuildingStatus | null => {
    if (!building.completed) return BuildingStatus.Construction;
    if (!building.enabled) return BuildingStatus.Disabled;
    if (staffing(building) === 0) return BuildingStatus.NoWorkers;
    if (!powered.has(building.id)) return BuildingStatus.NoEnergy;
    return null;
  };
  return {
    workers,
    employed: [...workers.values()].reduce((total, count) => total + count, 0),
    energy: capacity - reserved,
    staffing,
    efficiency,
    status,
  };
}

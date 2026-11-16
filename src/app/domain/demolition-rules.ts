import { BuildingType } from '../models/enum/building-type';
import { DemolitionError } from '../models/enum/demolition-error';
import { Colony } from '../models/interface/colony';
import { BUILDINGS_BY_TYPE } from './building-catalogue';

export function demolitionProblem(
  colony: Colony | undefined,
  buildingId: number,
): DemolitionError | null {
  if (!colony) return DemolitionError.ColonyMissing;
  const building = colony.buildings.find((building) => building.id === buildingId);
  if (!building) return DemolitionError.BuildingMissing;
  if (building.type === BuildingType.Base) return DemolitionError.BaseProtected;
  const definition = BUILDINGS_BY_TYPE[building.type];
  if (
    building.completed &&
    colony.stocks.energy + definition.costEnergy < definition.energyGainFor(colony.planet)
  )
    return DemolitionError.Energy;
  return null;
}

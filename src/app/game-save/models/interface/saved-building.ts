import { BuildingType } from '../../../planet/models/enum/building-type';

export interface SavedBuilding {
  readonly id: number;
  readonly type: BuildingType;
  readonly tile: number;
  readonly startedAt: number;
  readonly completesAt: number;
  readonly completed: boolean;
  readonly enabled: boolean;
  readonly disabledByFinance: boolean;
}

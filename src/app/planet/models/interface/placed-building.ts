import { BuildingStatus } from '../enum/building-status';
import { BuildingType } from '../enum/building-type';

export interface PlacedBuilding {
  readonly id: number;
  readonly type: BuildingType;
  readonly tile: number;
  readonly startedAt: number;
  readonly completesAt: number;
  readonly completed: boolean;
  readonly enabled: boolean;
  readonly disabledByFinance?: boolean;
  readonly status: BuildingStatus;
}

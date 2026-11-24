import { SavedBuilding } from './saved-building';

export interface SavedColony {
  readonly planetId: string;
  readonly stocks: {
    readonly minerals: number;
    readonly water: number;
    readonly food: number;
    readonly gas: number;
    readonly population: number;
  };
  readonly deposits: {
    readonly minerals: number;
    readonly gas: number;
  };
  readonly buildings: readonly SavedBuilding[];
}

import { SavedColony } from './saved-colony';
import { SavedPlanet } from './saved-planet';

export const GAME_SAVE_VERSION = 3;

export interface GameSave {
  readonly version: typeof GAME_SAVE_VERSION;
  readonly savedAt: string;
  readonly gameTime: number;
  readonly lastProductionTick: number;
  readonly credits: number;
  readonly creditRemainder: number;
  readonly maintenanceShortfall: number;
  readonly planets: readonly SavedPlanet[];
  readonly colonies: readonly SavedColony[];
  readonly nextBuildingId: number;
  readonly manualPaused: boolean;
}

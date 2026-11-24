import { BuildError } from '../../models/enum/build-error';
import { BuildingOperationError } from '../../models/enum/building-operation-error';
import { BuildingStatus } from '../../models/enum/building-status';
import { DemolitionError } from '../../models/enum/demolition-error';

export const BUILDING_OPERATION_ERROR_LABELS: Readonly<Record<BuildingOperationError, string>> = {
  [BuildingOperationError.Paused]: 'Игра на паузе: изменение зданий недоступно',
  [BuildingOperationError.ColonyMissing]: 'Колония не инициализирована',
  [BuildingOperationError.BuildingMissing]: 'Здание не найдено',
  [BuildingOperationError.Protected]: 'Главную базу и жилые комплексы нельзя отключать',
  [BuildingOperationError.Construction]: 'Сначала завершите строительство',
};

export const DEMOLITION_ERROR_LABELS: Readonly<Record<DemolitionError, string>> = {
  [DemolitionError.Paused]: 'Игра на паузе: изменение зданий недоступно',
  [DemolitionError.ColonyMissing]: 'Колония не инициализирована',
  [DemolitionError.BuildingMissing]: 'Здание не найдено',
  [DemolitionError.BaseProtected]: 'Главную базу нельзя снести',
  [DemolitionError.Energy]: 'Сначала освободите энергию или постройте другую энергостанцию',
};

export const BUILD_ERROR_LABELS: Readonly<Record<BuildError, string>> = {
  [BuildError.IdExhausted]: 'Исчерпан безопасный диапазон идентификаторов зданий',
  [BuildError.Paused]: 'Игра на паузе: изменение зданий недоступно',
  [BuildError.ColonyMissing]: 'Колония не инициализирована',
  [BuildError.BaseExists]: 'Главная база уже размещена',
  [BuildError.BaseRequired]: 'Сначала завершите главную базу',
  [BuildError.MapFull]: 'Нет свободных участков',
  [BuildError.Depleted]: 'Месторождение исчерпано',
  [BuildError.WaterUnavailable]: 'На планете нет воды',
  [BuildError.Credits]: 'Недостаточно кредитов',
  [BuildError.Minerals]: 'Недостаточно минералов',
  [BuildError.Water]: 'Недостаточно воды',
  [BuildError.Gas]: 'Недостаточно газа',
  [BuildError.Energy]: 'Недостаточно энергии',
  [BuildError.InvalidTile]: 'Недопустимый участок',
  [BuildError.Occupied]: 'Участок уже занят',
};

export const BUILDING_STATUS_LABELS: Readonly<Record<BuildingStatus, string>> = {
  [BuildingStatus.Construction]: 'Строительство',
  [BuildingStatus.Working]: 'Работает',
  [BuildingStatus.Depleted]: 'Месторождение исчерпано',
  [BuildingStatus.NoEnergy]: 'Недостаточно энергии',
  [BuildingStatus.NoWater]: 'Недостаточно воды',
  [BuildingStatus.NoWorkers]: 'Нет работников',
  [BuildingStatus.Disabled]: 'Отключено',
};

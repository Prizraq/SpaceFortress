import { BuildError, BuildingStatus } from '../../models/interface/colony';

export const BUILD_ERROR_LABELS: Readonly<Record<BuildError, string>> = {
  'colony-missing': 'Колония не инициализирована',
  'base-exists': 'Главная база уже размещена',
  'base-required': 'Сначала завершите главную базу',
  'map-full': 'Нет свободных участков',
  depleted: 'Месторождение исчерпано',
  'water-unavailable': 'На планете нет воды',
  credits: 'Недостаточно кредитов',
  minerals: 'Недостаточно минералов',
  water: 'Недостаточно воды',
  gas: 'Недостаточно газа',
  energy: 'Недостаточно энергии',
  'invalid-tile': 'Недопустимый участок',
  occupied: 'Участок уже занят',
};

export const BUILDING_STATUS_LABELS: Readonly<Record<BuildingStatus, string>> = {
  construction: 'Строительство',
  working: 'Работает',
  depleted: 'Месторождение исчерпано',
  'no-energy': 'Недостаточно энергии',
};

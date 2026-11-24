import { BuildingType } from '../../planet/models/enum/building-type';
import { GAME_SAVE_VERSION, GameSave } from '../models/interface/game-save';
import { SavedBuilding } from '../models/interface/saved-building';
import { SavedColony } from '../models/interface/saved-colony';
import { SavedPlanet } from '../models/interface/saved-planet';
import { BUILDINGS_BY_TYPE } from '../../planet/domain/building-catalogue';
import { gridSize, PRODUCTION_INTERVAL_MS } from '../../planet/domain/colony-simulation';

function invalid(path: string, reason: string): never {
  throw new Error(`Сохранение: ${path} — ${reason}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(path, 'ожидается объект');
  return value;
}

function field(value: Record<string, unknown>, key: string, path = ''): unknown {
  if (!Object.hasOwn(value, key))
    invalid(path ? `${path}.${key}` : key, 'обязательное поле отсутствует');
  return value[key];
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, 'ожидается массив');
  return value;
}

function number(value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    invalid(path, `ожидается конечное число от ${min} до ${max}`);
  return value;
}

function integer(value: unknown, path: string, min = 0): number {
  const result = number(value, path, min);
  if (!Number.isSafeInteger(result)) invalid(path, 'ожидается безопасное целое число');
  return result;
}

function positive(value: unknown, path: string): number {
  const result = number(value, path);
  if (result === 0) invalid(path, 'число должно быть больше нуля');
  return result;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') invalid(path, 'ожидается логическое значение');
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    invalid(path, 'ожидается непустая строка');
  return value;
}

function identifier(value: unknown, path: string): string {
  const result = text(value, path);
  if (Object.hasOwn(Object.prototype, result)) invalid(path, 'служебное имя недопустимо');
  return result;
}

function readPlanet(input: unknown, path: string): SavedPlanet {
  const value = record(input, path);
  const resourcesPath = `${path}.resourses`;
  const resources = record(field(value, 'resourses', path), resourcesPath);
  const planet: SavedPlanet = {
    id: identifier(field(value, 'id', path), `${path}.id`),
    name: text(field(value, 'name', path), `${path}.name`),
    radius: positive(field(value, 'radius', path), `${path}.radius`),
    distanceFromSun: positive(field(value, 'distanceFromSun', path), `${path}.distanceFromSun`),
    orbitalPeriod: positive(field(value, 'orbitalPeriod', path), `${path}.orbitalPeriod`),
    mass: positive(field(value, 'mass', path), `${path}.mass`),
    gravity: positive(field(value, 'gravity', path), `${path}.gravity`),
    athmosphere: boolean(field(value, 'athmosphere', path), `${path}.athmosphere`),
    resourses: {
      minerals: number(
        field(resources, 'minerals', resourcesPath),
        `${resourcesPath}.minerals`,
        0,
        100,
      ),
      water: number(field(resources, 'water', resourcesPath), `${resourcesPath}.water`, 0, 100),
      gas: number(field(resources, 'gas', resourcesPath), `${resourcesPath}.gas`, 0, 100),
    },
  };
  if (!Number.isSafeInteger(BUILDINGS_BY_TYPE[BuildingType.Power].energyGainFor(planet)))
    invalid(`${path}.distanceFromSun`, 'расстояние даёт недопустимую энергомощность');
  if (!Number.isFinite(365 / planet.orbitalPeriod))
    invalid(`${path}.orbitalPeriod`, 'период слишком мал для орбитальной анимации');
  return planet;
}

function readBuildingType(value: unknown, path: string): BuildingType {
  for (const type of Object.values(BuildingType)) {
    if (value === type) return type;
  }
  return invalid(path, 'неизвестный тип здания');
}

function readBuilding(
  input: unknown,
  path: string,
  planet: SavedPlanet,
  gameTime: number,
  lastTick: number,
  ids: Set<number>,
  tiles: Set<number>,
): SavedBuilding {
  const value = record(input, path);
  const building: SavedBuilding = {
    id: integer(field(value, 'id', path), `${path}.id`, 1),
    type: readBuildingType(field(value, 'type', path), `${path}.type`),
    tile: integer(field(value, 'tile', path), `${path}.tile`),
    startedAt: number(field(value, 'startedAt', path), `${path}.startedAt`),
    completesAt: number(field(value, 'completesAt', path), `${path}.completesAt`),
    completed: boolean(field(value, 'completed', path), `${path}.completed`),
    enabled: boolean(field(value, 'enabled', path), `${path}.enabled`),
  };
  if (ids.has(building.id)) invalid(`${path}.id`, 'идентификатор здания повторяется');
  ids.add(building.id);
  if (building.tile >= gridSize(planet.radius) ** 2)
    invalid(`${path}.tile`, 'клетка находится за пределами карты');
  if (tiles.has(building.tile)) invalid(`${path}.tile`, 'клетка уже занята');
  tiles.add(building.tile);
  if (building.startedAt > gameTime) invalid(`${path}.startedAt`, 'стройка ещё не могла начаться');
  if (building.completesAt <= building.startedAt)
    invalid(`${path}.completesAt`, 'срок должен быть позже начала строительства');
  if (building.completed && building.completesAt > lastTick)
    invalid(`${path}.completed`, 'здание завершено раньше производственного шага');
  if (!building.completed && building.completesAt <= lastTick)
    invalid(`${path}.completed`, 'пропущено завершение на уже обработанном шаге');
  if (
    !building.enabled &&
    (!building.completed ||
      building.type === BuildingType.Base ||
      building.type === BuildingType.Housing)
  )
    invalid(`${path}.enabled`, 'незавершённое или защищённое здание нельзя отключить');
  return building;
}

function readColony(
  input: unknown,
  path: string,
  planets: ReadonlyMap<string, SavedPlanet>,
  gameTime: number,
  lastTick: number,
  colonyIds: Set<string>,
  buildingIds: Set<number>,
): SavedColony {
  const value = record(input, path);
  const planetId = identifier(field(value, 'planetId', path), `${path}.planetId`);
  const planet = planets.get(planetId);
  if (!planet) invalid(`${path}.planetId`, 'планета отсутствует в сохранении');
  if (colonyIds.has(planetId)) invalid(`${path}.planetId`, 'колония этой планеты уже указана');
  colonyIds.add(planetId);
  const stocksPath = `${path}.stocks`;
  const stocks = record(field(value, 'stocks', path), stocksPath);
  const depositsPath = `${path}.deposits`;
  const deposits = record(field(value, 'deposits', path), depositsPath);
  const tiles = new Set<number>();
  const buildings = Array.from(
    array(field(value, 'buildings', path), `${path}.buildings`),
    (building, index) =>
      readBuilding(
        building,
        `${path}.buildings[${index}]`,
        planet,
        gameTime,
        lastTick,
        buildingIds,
        tiles,
      ),
  );
  const bases = buildings.filter((building) => building.type === BuildingType.Base);
  if (bases.length > 1) invalid(`${path}.buildings`, 'в колонии может быть только одна база');
  for (const building of buildings) {
    if (building.type === BuildingType.Base) continue;
    const base = bases[0];
    if (
      !base?.completed ||
      building.startedAt <
        Math.ceil(base.completesAt / PRODUCTION_INTERVAL_MS) * PRODUCTION_INTERVAL_MS
    )
      invalid(`${path}.buildings`, 'здания требуют ранее завершённую главную базу');
  }
  return {
    planetId,
    stocks: {
      minerals: number(field(stocks, 'minerals', stocksPath), `${stocksPath}.minerals`),
      water: number(field(stocks, 'water', stocksPath), `${stocksPath}.water`),
      food: number(field(stocks, 'food', stocksPath), `${stocksPath}.food`),
      gas: number(field(stocks, 'gas', stocksPath), `${stocksPath}.gas`),
      population: integer(field(stocks, 'population', stocksPath), `${stocksPath}.population`),
    },
    deposits: {
      minerals: number(
        field(deposits, 'minerals', depositsPath),
        `${depositsPath}.minerals`,
        0,
        planet.resourses.minerals * 1000,
      ),
      gas: number(
        field(deposits, 'gas', depositsPath),
        `${depositsPath}.gas`,
        0,
        planet.resourses.gas * 1000,
      ),
    },
    buildings,
  };
}

function readVersion1(value: Record<string, unknown>): GameSave {
  const savedAt = text(field(value, 'savedAt'), 'savedAt');
  const date = new Date(savedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== savedAt)
    invalid('savedAt', 'ожидается корректная дата ISO 8601 UTC');
  const gameTime = number(field(value, 'gameTime'), 'gameTime');
  const lastTick = integer(field(value, 'lastProductionTick'), 'lastProductionTick');
  if (
    lastTick % PRODUCTION_INTERVAL_MS !== 0 ||
    gameTime < lastTick ||
    gameTime - lastTick >= PRODUCTION_INTERVAL_MS
  )
    invalid('lastProductionTick', 'граница шага не согласована с игровым временем');
  const planets = Array.from(array(field(value, 'planets'), 'planets'), (planet, index) =>
    readPlanet(planet, `planets[${index}]`),
  );
  if (planets.length === 0) invalid('planets', 'требуется хотя бы одна планета');
  const byId = new Map<string, SavedPlanet>();
  for (const planet of planets) {
    if (byId.has(planet.id)) invalid('planets', `повторяется идентификатор ${planet.id}`);
    byId.set(planet.id, planet);
  }
  const buildingIds = new Set<number>();
  const colonyIds = new Set<string>();
  const colonies = Array.from(array(field(value, 'colonies'), 'colonies'), (colony, index) =>
    readColony(colony, `colonies[${index}]`, byId, gameTime, lastTick, colonyIds, buildingIds),
  );
  const nextBuildingId = integer(field(value, 'nextBuildingId'), 'nextBuildingId', 1);
  for (const id of buildingIds) {
    if (id >= nextBuildingId)
      invalid('nextBuildingId', 'следующий идентификатор должен быть больше всех существующих');
  }
  return {
    version: GAME_SAVE_VERSION,
    savedAt,
    gameTime,
    lastProductionTick: lastTick,
    credits: integer(field(value, 'credits'), 'credits'),
    planets,
    colonies,
    nextBuildingId,
    manualPaused: boolean(field(value, 'manualPaused'), 'manualPaused'),
  };
}

export function readGameSave(input: unknown): GameSave {
  let decoded: unknown = input;
  if (typeof input === 'string') {
    try {
      decoded = JSON.parse(input);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new Error('Сохранение: некорректный JSON.', { cause: error });
    }
  }
  const value = record(decoded, 'корень');
  const version = integer(field(value, 'version'), 'version');
  switch (version) {
    case GAME_SAVE_VERSION:
      return readVersion1(value);
    default:
      return invalid(
        'version',
        `версия ${version} не поддерживается (поддерживается ${GAME_SAVE_VERSION})`,
      );
  }
}

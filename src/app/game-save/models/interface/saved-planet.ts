export interface SavedPlanet {
  readonly id: string;
  readonly name: string;
  readonly radius: number;
  readonly distanceFromSun: number;
  readonly orbitalPeriod: number;
  readonly mass: number;
  readonly gravity: number;
  readonly athmosphere: boolean;
  readonly resourses: {
    readonly water: number;
    readonly minerals: number;
    readonly gas: number;
  };
}

# SpaceFortress

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.6.

## Solar system data

`PlanetService.getPlanets()` returns fresh dummy data for three planets using the existing `Planet` interface.
`radius` is in kilometres, `distanceFromSun` in astronomical units, `orbitalPeriod` in Earth days,
`mass` in Earth masses, and `gravity` in metres per second squared.
The values in `resourses` are independent resource abundance scores from 0 to 100, not composition percentages.
The existing field names `athmosphere` and `resourses` are preserved.
Each planet has a stable `id`; colony state is keyed by this id, not its display name.

`SolarSystemRendererService` owns PixiJS initialization, scene creation, animation, selection highlights,
and resource cleanup, including failed or interrupted initialization. It is provided per component
so each map has its own renderer. Pixel generation is a pure function in `planet-texture.ts`.
Orbital distances and periods drive the map; displayed planet sizes are compressed for readability,
and textures are illustrative rather than scientific surface maps.
Planets move automatically, including when `prefers-reduced-motion` is enabled; no motion button
is required. Angular speed uses frame time in seconds and is consistent at 30, 60 and 144 FPS.
An animation step is capped at 1/30 second to avoid jumps after stalls or background-tab suspension.
Labels stay centred below their planets, and scene layout is recalculated only on viewport resize.
The orbital renderer pauses while a colony surface is open and resumes on return.

## Planet colonies

Open a planet with a double-click on its orbital marker or with the planet panel's surface button.
The surface uses `honeycomb-grid`; its side length is `round(radius / 1000) + 3`, clamped to 5-15,
so the number of buildable hexagons is the square of that value.

`ColonyService` owns a shared credit balance and independent mineral, water, gas, energy, population,
and building state for each planet. Initial funds are 2000 credits; each colony starts with
240 minerals, 160 water, 120 gas, and 100 energy. State survives screen changes, but is currently
in memory only: reloading the application starts a new session.

Build one main base per planet before placing other buildings. Select a building in the catalogue
and a free hexagon, select a free hexagon and press its catalogue build button, or drag a catalogue
entry onto the map. Cancelling a drag does not activate click placement. Costs are charged on
placement; `Colony.buildings` is the sole list of placed buildings, including construction sites.
Selecting a placed building shows its overview,
construction progress, production, and energy requirements. Upgrades are not implemented yet.

Production runs on a 2-second timer for all initialized colonies, including planets not currently open.
Elapsed simulation steps are replayed chronologically after delayed callbacks. Opening a planet
or placing a building first advances the simulation, so new buildings cannot produce retroactively.
Generators run before consumers; if energy is still insufficient, consumers run by placement id.
Mineral and gas reserves initially equal their planetary abundance score times 1000; extraction
moves resources into the colony's stockpile and stops when the reserve is exhausted or energy is lacking.
Water production scales with water abundance without depleting it. Base and power stations generate
energy; each completed residential complex adds 20 population once. Construction times are in seconds
and completion is processed on the production tick. A newly completed building first produces
on the following tick. `ColonyService` handles the timer and publishes readonly signals with frozen
snapshots; pure simulation and construction rules live under `src/app/domain/`.
Balancing values and serializable building definitions live in `building-catalogue.ts`;
domain status and error codes are translated by the map UI, not the simulation.

## Installation

Install and run commands from the `space-fortress` directory. PixiJS is declared in this project's
dependencies; packages installed in the parent directory are not required.

```bash
npm ci
```

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

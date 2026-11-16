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
Helios uses a self-luminous procedural texture with a white-gold core, plasma granulation,
and a soft orange corona instead of directional planet-like shading. The texture is generated once
per renderer, not on animation frames, and is released together with the planet textures.
Planets move automatically, including when `prefers-reduced-motion` is enabled; no motion button
is required. Angular speed uses frame time in seconds and is consistent at 30, 60 and 144 FPS.
An animation step is capped at 1/30 second to avoid jumps after stalls or background-tab suspension.
Labels stay centred below their planets, and scene layout is recalculated only on viewport resize.
The orbital renderer pauses while a colony surface is open and resumes on return.

## Planet colonies

Open a planet with a double-click on its orbital marker or with the planet panel's surface button.
The surface uses `honeycomb-grid`; its side length is `round(radius / 1000) + 3`, clamped to 5-15,
so the number of buildable hexagons is the square of that value.
Terrain and hexagons are projected to 75% of their original height for a pseudo-isometric view.
Building sprites retain their proportions, sit on soft ground shadows, and render back-to-front.
The map opens at 150% scale or the minimum needed to fill its viewport, without scrollbars.
Use the mouse wheel to zoom toward the cursor and drag with the primary pointer to pan.
The minimum zoom adapts to the viewport; the upper limit is 300% or the fit scale if that is larger.
Camera bounds prevent empty areas at the sides and bottom, including after viewport resizing.
A shallow curved horizon has a black background above it. Brighter grid lines have a dark halo
to remain visible against ice as well as dark terrain.
A short click still selects or builds on a hexagon; panning does neither.
Keyboard focus brings off-screen hexagons into view. Changing planets resets the view.
The catalogue and inspector retain their independent scrolling.
The hexagons share one continuous procedural surface texture, seeded by the planet's stable id.
The same terrain extends beyond the hexagons on a backdrop with straight sides and a curved top;
this surrounding area is decorative and does not add buildable tiles.
Layered terrain noise, slope lighting, coastlines, and craters replace independent tile colours.
Dry airless worlds use rust and rock; temperate worlds use vegetation and water; distant wet worlds
use cold rock and ice. These are illustrative biomes, not scientific climate or water-coverage models.
The texture is generated with Canvas on planet changes (up to 1200 pixels on its longest side),
not on simulation ticks, selection, zoom, or panning. Buildings and interactions remain unchanged;
all hexagons are still buildable regardless of their visual terrain.

`ColonyService` owns a shared credit balance and independent mineral, water, food, gas, energy, population,
and building state for each planet. Initial funds are 2000 credits; each colony starts with
240 minerals, 160 water, 100 food, 120 gas, zero free energy, and zero population capacity. State survives screen changes, but is currently
in memory only: reloading the application starts a new session.

Build one main base per planet before placing other buildings. Select a building in the catalogue
and a free hexagon, select a free hexagon and press its catalogue build button, or drag a catalogue
entry onto the map. Cancelling a drag does not activate click placement. Costs are charged on
placement; `Colony.buildings` is the sole list of placed buildings, including construction sites.
Selecting a placed building shows its overview,
construction progress, production, and energy requirements. Upgrades are not implemented yet.
The inspector can demolish any building except the main base, including cancelling construction.
Demolition requires confirmation, frees its tile and reserved energy, and refunds no materials or credits.
Completed power stations cannot be removed if that would leave an energy deficit.
Removing completed housing lowers capacity immediately; excess population falls by one per cycle
until it reaches the new capacity (at most one resident lost per cycle, including during famine).

Production runs on a 2-second timer for all initialized colonies, including planets not currently open.
Elapsed simulation steps are replayed chronologically after delayed callbacks. Opening a planet
or placing a building first advances the simulation, so new buildings cannot produce retroactively.
Mineral and gas reserves initially equal their planetary abundance score times 1000; extraction
moves resources into the colony's stockpile and stops when the reserve is exhausted.
Water stations produce `ceil(12 * waterPercentage / 100)` per cycle without depleting planetary water:
1 on Ares (8%), 12 on Terra (92%), and 8 on Boreya (65%); zero water yields no production.
Each completed main base
supplies a fixed 0.5 water and 1 food per 2-second cycle, independent of planet abundance.
This sustains its initial five residents indefinitely, even from empty stocks; extra residents and
industry still need additional supplies. Each cycle applies base supplies and water stations first,
then supplies residents at 0.1 water per resident, then runs farms and supplies food,
then runs other buildings by placement id. Farms have priority over mines for remaining water.
Mineral and gas mines each consume 1 water per productive cycle, including a partial
final extraction; exhausted mines consume none. Farms also consume 1 water per productive cycle.
Other buildings consume no operating water.
If residents cannot be fully supplied, they use the remaining water and population growth pauses,
without deaths. Mines wait for their full water requirement and resume automatically when supplied.
Construction water costs remain separate, and buildings under construction have no operating demand.
The map shows the water stockpile and projected production minus full demand, including paused mines
but excluding depleted mines. A negative balance warns of an unsustainable water supply even when
production is paused. Water has no storage cap yet; stocks are kept to tenths.

Farms cost 100 credits, 30 minerals, 10 water, and 5 gas; construction takes 6 seconds and reserves
5 energy. Each completed, watered farm produces a fixed 4 food per cycle on every planet.
Only residents consume food, at 0.2 per resident per cycle; food is never a construction cost
or prerequisite. Stored food covers production deficits until exhausted. On an undersupplied
cycle, food drops to zero and population falls by 1, down to zero if necessary.
Population decline stops when current production can supply the remaining residents.
With no stored food, growth requires enough production to feed one additional resident,
preventing oscillation around the sustainable population. Building housing during famine
still increases capacity, but does not add residents. Food and water are tracked to tenths.
The food indicator uses base supplies plus actual projected farm output (accounting for water shortages):
red for a negative balance, yellow for 0 through +0.2, green above +0.2.
An empty food stockpile also displays "Голод!", including at exact production/consumption balance.

Energy is unused power capacity,
not a stockpile produced or consumed each tick. The completed base adds 10 energy once, and each
completed solar power station adds `round(16 / distanceFromSun)` once, with distance measured relative
to Terra's orbit: 25 on Ares (0.65), 16 on Terra (1), and 10 on Boreya (1.6).
The catalogue, inspector, and demolition checks use this same planet-specific capacity;
demolition removes the capacity supplied by the station. Base power remains 10 on every planet.
Starting construction reserves 5 energy for a water station,
mineral mine, gas mine, or farm, and 10 for housing. Insufficient free energy blocks construction;
already powered buildings keep producing even when no free energy remains.
The completed base starts with 5 residents and a capacity of 5. Each completed residential complex
adds 20 capacity, not residents. Population grows by 1 every 2 seconds up to the current capacity
when food and water are sufficient. New residents start consuming on the following tick;
newly added capacity is available for growth starting on the next tick.
Construction times are in seconds
and completion is processed on the production tick. A newly completed building first produces
on the following tick. `ColonyService` handles the timer and publishes readonly signals with frozen
snapshots; pure simulation and construction rules live under `src/app/domain/`.
Each building has a class under `src/app/models/class/`, with its balancing values and inherited
resource-effect methods (`complete`, `provideLifeSupport`, `produce`, and `demolish`). `building-catalogue.ts` registers frozen class
instances; placed-building snapshots remain plain serializable data.
domain status and error codes are translated by the map UI, not the simulation.

Colony model interfaces live in `src/app/models/interface/`, one interface per file.
`BuildingType`, `ProducedResource`, `BuildingStatus`, `BuildError`, and `DemolitionError` are string enums
in `src/app/models/enum/`; their values preserve the existing serialized codes.

## Building artwork

The seven building types, including the farm, use the supplied PNG artwork in the catalogue, on the hex map,
and in the building inspector. Original PNG/JPEG files stay unchanged in
`SpaceFortressAssets/SpaceFortressAssets/`; only optimized PNG copies from
`public/assets/buildings/` are served by the application.

To regenerate these copies after replacing the source PNG files, run:

```bash
npm run assets:buildings
```

The script uses `sharp`, removes near-white background connected to the image edges, and resizes
the result to fit within 320x240 pixels with transparency.

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

# SpaceFortress

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.6.

## Source structure

Application code is grouped by feature under `src/app/`:

- `solar-system/` owns the orbital map, planet information panel, PixiJS renderer,
  and orbital planet/sun textures.
- `planet/` owns the colony surface, buildings, construction, and colony simulation.
  Pure game rules live in its additional `domain/` folder.
- `game-session/` owns `GameSessionService`: the single session state, shared credits,
  planets, colonies, game clock, pause reasons, commands, and snapshot creation/restoration.
  Its `domain/` contains the pure fixed-point credit ledger; `components/` contains
  the financial summary reused on the orbit and surface.
- `game-save/` owns the snapshot schema, validation, storage/file adapters, autosaving,
  and startup/session-menu components.
- `shared/` contains the `Planet` and `PlanetResourses` interfaces, `PlanetService`,
  and the reusable game icon component. Shared code must not depend on either feature.

Each area has `components/`, `models/` (with `class/`, `enum/`, and `interface/`),
and `services/`. Empty model folders are retained with `.gitkeep` until needed;
do not add placeholder models or move feature-specific models into `shared/`.
Tests stay alongside the code they cover. The solar-system screen composes the planet
surface component; colony code does not depend on solar-system internals.
Pure colony rules do not depend on session management or save formats.
Both game screens use the same session service; storage and file access stay in `game-save/`.

Domain helpers remain pure module exports, without Angular services or shared mutable state.
Consumers, tests, and other domain modules use PascalCase namespace imports so calls identify
their responsibility, for example `import * as ColonyFinance from '../../planet/domain/colony-finances'`
and `ColonyFinance.colonyFinances(colony)`. The module names are `BuildingCatalogue`, `BuildingRules`,
`ColonyFinance`, `ColonySimulation`, `ColonyWorkforce`, `DemolitionRules`, `CreditLedger`,
`SessionMaintenance`, and `GameSaveValidation`. Calls within the defining module stay local;
model types and Angular services retain their ordinary named imports.

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
The star's visible disc is larger than every planet. Planet markers retain their larger click areas
independently of the reduced globe sizes, keeping selection and double-clicking comfortable.
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
The colony fills the viewport without page-level scrolling; the catalogue, information tab content,
and narrow-screen resource bar scroll independently. On wide screens, drag the two separators to
resize the side panels (200-480 px, each limited to 35% of the workspace so the map remains usable).
Focused separators also support Left/Right arrows and Home/End. On screens up to 900 px wide,
both panels sit below the map instead of extending the page.
The right panel has Planet, Building, and Finances tabs. Planet is the initial view and includes
physical telemetry, resource abundance, and a live colony summary. Selecting a tile or placing
a building opens Building; switching tabs preserves the selection. Finances contains the existing
shared budget and the current colony's contribution instead of taking up a full-width screen row.
Tabs support arrow keys and Home/End. Panel widths and the selected tab are view state, not save data.
The hexagons share one continuous procedural surface texture, seeded by the planet's stable id.
The same terrain extends beyond the hexagons on a backdrop with straight sides and a curved top;
this surrounding area is decorative and does not add buildable tiles.
Layered terrain noise, slope lighting, small lakes, and craters replace independent tile colours.
Water appears only in isolated ponds, each smaller than one hex in both area and extent.
Their scale follows the actual hex size and canvas resolution, and separated lake centres prevent
ponds from merging into oceans. Low-lying areas outside the ponds remain dry land.
Dry airless worlds use rust and rock; temperate worlds use vegetation and water; distant wet worlds
use cold rock and ice. These are illustrative biomes, not scientific climate or water-coverage models.
The texture is generated with Canvas on planet changes (up to 1200 pixels on its longest side),
not on simulation ticks, selection, zoom, or panning. Buildings and interactions remain unchanged;
all hexagons are still buildable regardless of their visual terrain.

`GameSessionService` owns a shared credit balance and independent mineral, water, food, gas, energy, population,
and building state for each planet. Initial funds are 2000 credits; each colony starts with
240 minerals, 160 water, 100 food, 120 gas, zero free energy, and zero population capacity.
State survives screen changes and can be saved locally or transferred through JSON files.
Reloading opens the startup screen, where a compatible save can be continued.
The autosave notification disappears after four seconds; a new autosave restarts that timeout.
Save notifications use a translucent background, while errors and confirmation prompts remain unchanged.

### Credits and maintenance

All colonies share one budget; mineral, water, food and gas stockpiles remain local.
Every actual resident pays the ordinary tax of 6 credits per game minute, including
residents without assigned work. Adjustable High / Middle / Low rates and population
satisfaction are reserved for stage 3, not implemented here.

Only mineral and gas mines require maintenance: 15 credits per game minute each.
Bases, housing, water stations, farms and power stations are free to maintain.
Construction sites and disabled mines incur no maintenance. Completed enabled mines
pay the full rate even when waiting for workers, water, power or depleted deposits.
The rates live in the existing building definitions as `maintenancePerMinute`.
Construction still charges its existing price once on placement; demolition refunds nothing.

Taxes use the population at the beginning of each existing 2-second game step,
before population changes and building completion. New residents and completed bases
start paying on the following step. Delayed callbacks
replay each step separately. Manual pause, hidden tabs, system stops and closed games
never accrue finances; loading applies no offline income.

`colonyFinances` and `sessionFinances` in `planet/domain/colony-finances.ts` are
the shared pure source for simulation and consumers. A colony result contains
`income` (credits per game minute), `incomeCentsPerStep` (exact hundredths per
production step), `buildings` (building id, type and projected maintenance),
`maintenance` (total projected expenses per game minute), and `balance` (income
minus projected expenses). The session result includes these totals and independent
colony contributions with planet ids and names. Calculations do not mutate inputs
or return references to building state.

`maintenanceCentsPerStep` is also returned for every building, colony and session.
Each step calculates taxes and maintenance from its starting state. Taxes of that
step are available immediately in the shared budget. If funds are insufficient,
the newest paid mines (descending global building id, independent of colony order)
are disabled until all remaining maintenance can be paid in full. Workers and
energy are recalculated, money is settled once, then production runs. A mine disabled
on that step neither pays nor produces; credits never become negative and no debt
or free unpaid production is created. Financially disabled mines stay off until a
manual toggle, which may trigger another shutdown on the next step.
Commands settle elapsed steps before changing a building, without retroactive charges.
The existing financial summary shows shared credits, tax income, maintenance and
regular balance per game minute. Colony information shows income, expenses and
its contribution to the shared budget. These are current-condition forecasts,
not historical income; one-time construction prices are separate.
On both screens its background is translucent while the text remains opaque.
The close button collapses it to a compact “Финансы” button; reopening shows the
current figures. Closing the summary does not pause the game or suppress financial
notifications, and its visibility is not saved with the session.
The catalogue and inspector show the one-time price, upkeep rate and whether
maintenance is currently required, including idle enabled mines and financial shutdowns.

A negative shared balance shows an approximate depletion time in game minutes/seconds,
including fractional credits, assuming unchanged population and paid buildings.
Zero or positive balance has no depletion forecast; paused time never reduces it.
Financially disabled buildings remain visible even after the deficit is gone.
One notification component serves both orbital and surface views: deficit onset,
new financial shutdowns and recovery are announced only on state transitions.
Notifications can be dismissed or expire after four real seconds, without being
repeated or extended every production step. Recovery distinguishes an eliminated
deficit from buildings that still require manual reactivation. Starting a new game
clears notifications. No history charts, assistant screen, loans or emergency grants are added.

Snapshots now use v3: `credits` holds whole credits, `creditRemainder` holds 0–99
hundredths. `maintenanceShortfall` is retained for compatibility with earlier v2
snapshots, but successful financial steps reset it to zero. Arithmetic retains exact
cents without multiplying the entire balance by 100; per-resident tax cents are
calculated before multiplying by population. Settlement uses the net change in
cents, so temporary tax income cannot overflow an otherwise representable final
balance before maintenance is deducted. Genuine overflow is explicitly rejected.
Credit displays format whole credits and the remainder separately, preserving
hundredths even at the largest supported whole-credit balance.
Monetary units and the v3 schema are unchanged.
Each saved building now requires a boolean
`disabledByFinance`; true is valid only for a completed disabled unprotected building.
This is a persistent reason, not a forecast derived from available credits.
Valid v1 snapshots migrate with zero remainder and shortfall;
v2 preserves both fields. Both old versions gain `disabledByFinance: false`.
historical deadlines, saved game time and the production-step remainder are unchanged.
Future unsupported versions and invalid monetary fields are explicitly rejected.
Compatibility tests cover unchanged v1 purchasing power, v2 cents saved both on
and between production boundaries, repeated loading after a stopped interval,
continuation matching uninterrupted play, reset of nonzero financial fields,
and export/import through a real JSON Blob and FileReader. Importing v1 writes
the migrated v3 snapshot to local storage. Derived financial forecasts are
discarded on input and never serialized.

For v2 and v3, `credits` and historical
`maintenanceShortfall` must be nonnegative safe integers; `creditRemainder`
must be an integer from 0 through 99. Unsupported versions and corrupted values
fail before state replacement or file download. Loading restores source values
without running a tax step; only new active production boundaries accrue income.
New games reset credits to 2000, both auxiliary monetary fields to zero, and
clear colonies and processed game time. See the financial format contract in
[the development plan](DEVELOPMENT_PLAN.md#12-добавить-локальные-сохранения).
Native file dialogs and a cross-browser matrix were not tested by this unit suite.

### Stage 2 verification

The final related run passed 371 tests in 14 files, the production build and the
test-project TypeScript check. A 24-game-hour regression compares 43,200 ordinary
steps with one delayed callback across two colonies: income 60/min, idle mine
maintenance 45/min, and starting funds 10.73 produce exactly 21610.73 credits,
preserving the partial-step phase. Existing tests also cover population changes,
pauses, shutdown ordering, construction/demolition, v1/v2/v3 migration,
save/load/continuation, export/import, new games and notification deduplication.

Browser verification built Terra's base, power, water, farm, housing and mine
through the actual controls, reaching 25 residents and +135/min. Twelve mines
cost 180/min against 150/min taxes. At zero credits the two newest mines shut
down; manually disabling one more restored +15/min and accumulated 100 credits
in 400 game seconds. The displayed forecasts, shutdown reason, pause and recovery
notifications matched the session. Game time was accelerated through the existing
clock and production steps, not through replacement colony fixtures.
The temporary server and browser save were removed after verification.

Stage 2 is **not declared fully complete**: the documented mineral-exhaustion
and water/gas bootstrap dead ends still have no recovery mechanism, as assistance
was explicitly deferred. Native file dialogs, actual OS sleep and a cross-browser
matrix remain unverified. Existing build warnings remain for bundle/style budgets
and Pixi's CommonJS dependency; jsdom also reports its unavailable canvas context.

### Construction, production and population

Recovery and balance measurements keep the ordinary tax at 6 credits per resident
per game minute and mine maintenance at 15; necessary support buildings remain free.
A completed base restores five residents even from zero population and empty stocks
in ten game seconds, with taxes resuming on the following steps. Spending all credits
is recoverable by taxes and disabling surplus mines, but this does not create local
minerals or gas. Cancelling first mines until minerals are exhausted, or exhausting
water and gas without a water station, can block further production despite a growing
credit budget. These reproducible resource dead ends and a proposed, unapproved
one-time paid recovery kit are documented in [the development plan](DEVELOPMENT_PLAN.md).
The confirmed decision is to defer assistance to a separate task: no recovery grant,
new persistent field or save version has been introduced.

Build one main base per planet before placing other buildings. Select a building in the catalogue
and a free hexagon, select a free hexagon and press its catalogue build button, or drag a catalogue
entry onto the map. Cancelling a drag does not activate click placement. Costs are charged on
placement; `Colony.buildings` is the sole list of placed buildings, including construction sites.
Selecting a placed building shows its overview,
construction progress, production, and energy requirements. Upgrades are not implemented yet.
The inspector can demolish any building except the main base, including cancelling construction.
It can also switch any completed building except the main base and housing off and back on.
Disabled buildings stay on their tiles but produce nothing and reserve no workers or energy,
consume no operating water, and do not deplete deposits. Changes apply immediately; switching a
power station off may trigger automatic power shedding. Switching on restores the building's
original placement priority, with output still limited by available staff, water, and power.
Construction sites cannot be switched off; they can still be cancelled through demolition.
Switching first catches the simulation up to the current time, so it never changes past production.
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
If residents cannot be fully supplied, they use the remaining water and population falls by one
resident per cycle. Simultaneous food/water shortages and excess housing population still cause
at most one death per cycle. With no stored water, growth requires enough water production for one
additional resident, preventing oscillation around the sustainable population.
Mines wait for their full water requirement and resume automatically when supplied.
Construction water costs remain separate, and buildings under construction have no operating demand.
The map shows the water stockpile and projected production minus full demand, including paused mines
but excluding depleted, manually disabled, and unpowered producers. A negative balance warns of an unsustainable water supply even when
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

Completed buildings receive whole workers automatically in placement-id order. Main bases and housing
need no workers; water stations need 3, and mines, farms, and power stations need 6 each.
Construction sites receive none. The allocation is derived by `allocateWorkers` in
`colony-workforce.ts`, separately from production, so a future management screen can replace the policy.
Workers remain assigned while their building waits for water, power, or deposits; disabling or demolition releases
them immediately. The population indicator shows total assigned workers, and the inspector shows
assigned/required workers, effective output, and efficiency. The catalogue lists staffing requirements.
Production and solar capacity scale by assigned/required workers: three of six workers give 50% output.
Insufficient population does not block construction; a building receives the remaining available workers.
Empty buildings produce nothing and consume no operating water; partially staffed producers still
need their full operating water per productive cycle. Base supplies and housing capacity are unaffected.
Allocation for production uses population at the start of the cycle; new residents work next cycle.
Resource stocks and deposits support tenths, including fractional extraction.

Energy is unused power capacity,
not a stockpile produced or consumed each tick. The completed base supplies 10 energy, and each
fully staffed solar power station supplies `round(16 / distanceFromSun)`, with distance measured relative
to Terra's orbit: 25 on Ares (0.65), 16 on Terra (1), and 10 on Boreya (1.6).
The catalogue, inspector, and demolition checks use this same planet-specific capacity;
demolition accounts for the station's actual capacity and the resulting worker reallocation.
Base power remains 10 on every planet.
Starting construction reserves 5 energy for a water station,
mineral mine, gas mine, or farm, and 10 for housing. Insufficient free energy blocks construction;
already powered buildings keep producing when exactly zero free energy remains.
Staffing, power capacity, and free energy are recalculated after population changes, completion,
placement, switching, and demolition. If capacity drops below reserved demand, free energy becomes negative;
construction reservations are retained and completed consumers shut down newest-first until demand
fits. They restart automatically oldest-first when capacity recovers. A newer consumer stays off if
an older one cannot be powered, even if the newer one would fit. Unpowered buildings retain workers.
Zero-energy construction, especially replacement power stations, remains possible during a deficit.
The completed base starts with 5 residents and a capacity of 5. Each completed residential complex
adds 20 capacity, not residents. Population grows by 1 every 2 seconds up to the current capacity
when food and water are sufficient. New residents start consuming on the following tick;
newly added capacity is available for growth starting on the next tick.
Construction times are in seconds
and completion is processed on the production tick. A newly completed building first produces
on the following tick. `GameSessionService` handles the timer and publishes readonly signals with frozen
snapshots; pure simulation and construction rules live under `src/app/planet/domain/`.
Each building has a class under `src/app/planet/models/class/`, with its balancing values and inherited
resource-effect methods (`complete`, `provideLifeSupport`, `produce`, and `demolish`). `building-catalogue.ts` registers frozen class
instances; placed-building snapshots remain plain serializable data.
domain status and error codes are translated by the map UI, not the simulation.

`freezeColony` only freezes an independent snapshot; it does not change energy or building statuses.
State-changing operations explicitly call `recalculateColonyWorkforce` before freezing.
Free energy is derived from staffing, enabled buildings, and construction reservations in one place,
not incremented/decremented by construction or building effects.

Version 1 and 2 saves preserve `startedAt` and `completesAt` as authoritative construction deadlines.
Validation requires a positive duration and consistency with processed production ticks, not equality
with the current catalogue. Balance changes therefore affect new construction without rescheduling
existing buildings or rejecting saves with historical durations. Snapshot structure/semantic changes
still require explicit versioning and compatibility decisions.

Colony model interfaces live in `src/app/planet/models/interface/`, one interface per file.
`BuildingType`, `ProducedResource`, `BuildingStatus`, `BuildError`, `BuildingOperationError`, and `DemolitionError` are string enums
in `src/app/planet/models/enum/`; their values preserve the existing serialized codes.

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

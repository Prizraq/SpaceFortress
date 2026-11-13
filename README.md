# SpaceFortress

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.6.

## Solar system data

`PlanetService.getPlanets()` returns fresh dummy data for three planets using the existing `Planet` interface.
`radius` is in kilometres, `distanceFromSun` in astronomical units, `orbitalPeriod` in Earth days,
`mass` in Earth masses, and `gravity` in metres per second squared.
The values in `resourses` are independent resource abundance scores from 0 to 100, not composition percentages.
The existing field names `athmosphere` and `resourses` are preserved.

`SolarSystemRendererService` owns PixiJS initialization, scene creation, animation, selection highlights,
and resource cleanup. It is provided per component so each map has its own renderer.
Orbital distances and periods drive the map; displayed planet sizes are compressed for readability,
and textures are illustrative rather than scientific surface maps.

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

import { vt as extensions } from "./CanvasPool-Mrw3ve4-.js";
import { u as Container } from "./Filter-x-mhKRb5.js";
import { c as DOMPipe, l as accessibilityTarget, n as EventSystem, t as FederatedContainer, u as AccessibilitySystem } from "./FederatedEventTarget-CuyNvhv0.js";
import "./FilterSystem-B77rqS38.js";
import "./init-BVtMKcrP.js";
// node_modules/pixi.js/lib/accessibility/init.mjs
extensions.add(AccessibilitySystem);
extensions.mixin(Container, accessibilityTarget);
// node_modules/pixi.js/lib/dom/init.mjs
extensions.add(DOMPipe);
// node_modules/pixi.js/lib/events/init.mjs
extensions.add(EventSystem);
extensions.mixin(Container, FederatedContainer);

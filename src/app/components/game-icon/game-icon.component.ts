import { Component, ElementRef, effect, inject, input } from '@angular/core';
import { ArrowLeft, Building2, CircleX, Coins, Droplets, Hammer, Minus, Pickaxe, Plus, Users, Wind, Zap, createElement } from 'lucide';

const icons = { back: ArrowLeft, base: Building2, power: Zap, water: Droplets, minerals: Pickaxe, gas: Wind, housing: Users, credits: Coins, build: Hammer, close: CircleX, plus: Plus, minus: Minus };
export type GameIconName = keyof typeof icons;

@Component({
  selector: 'app-game-icon',
  standalone: true,
  template: '',
  styles: ':host { display: inline-flex; width: 18px; height: 18px; flex: 0 0 18px; vertical-align: middle; }',
})
export class GameIconComponent {
  readonly name = input.required<GameIconName>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      this.element.nativeElement.replaceChildren(createElement(icons[this.name()], {
        width: 18, height: 18, 'stroke-width': 1.6, 'aria-hidden': 'true',
      }));
    });
  }
}

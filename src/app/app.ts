import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GameStartComponent } from './game-save/components/game-start/game-start.component';

@Component({
  imports: [RouterOutlet, GameStartComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly playing = signal(false);
  protected readonly title = signal('space-fortress');
}

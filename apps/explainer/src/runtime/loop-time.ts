/**
 * Loop time from clock time (D32): it restarts at 0 whenever the arrival epoch changes, runs
 * while playing, and holds while paused. The first epoch starts at clock time 0, so a held
 * clock (`?clock=held&t=5`) shows loop time 5.
 */
export class LoopTime {
  #epoch: number | null = null;
  #start = 0;
  #pausedAt: number | null = null;

  /** Loop time at clock time `now`. Allocation-free; call once per frame. */
  at(now: number, epoch: number, playing: boolean): number {
    if (this.#epoch === null) this.#epoch = epoch;
    else if (epoch !== this.#epoch) {
      this.#epoch = epoch;
      this.#start = now;
      this.#pausedAt = playing ? null : now;
    }
    if (!playing && this.#pausedAt === null) this.#pausedAt = now;
    if (playing && this.#pausedAt !== null) {
      this.#start += now - this.#pausedAt;
      this.#pausedAt = null;
    }
    return (this.#pausedAt ?? now) - this.#start;
  }
}

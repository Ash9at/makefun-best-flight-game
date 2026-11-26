// pilotlog.js — the pilot's log book.
//
// Best score and rank per sortie plus a play count, kept in memory for
// the session only: the hosted page may not store anything, so the
// campaign board on the title screen is rebuilt on every visit and
// flying the same sortie twice is how a best is beaten.

export class PilotLog {
  constructor() {
    this.entries = {}; // sortie id -> {best, rank, plays}
  }

  // Record a finished sortie; returns true when it set a new best.
  record(mission) {
    const id = mission.sortie.id;
    const entry = this.entries[id] || (this.entries[id] = { best: 0, rank: '—', plays: 0 });
    entry.plays++;
    if (mission.state === 'complete' && mission.result.score > entry.best) {
      entry.best = mission.result.score;
      entry.rank = mission.result.rank;
      return true;
    }
    return false;
  }

  get(id) {
    return this.entries[id] || null;
  }

  // The campaign line for the title screen: how much of the island's
  // work has been flown, and the sum of the best scores.
  campaign(sorties) {
    const flown = sorties.filter((s) => this.entries[s.id]).length;
    const total = sorties.reduce((sum, s) => sum + (this.entries[s.id] ? this.entries[s.id].best : 0), 0);
    return { flown, total };
  }
}

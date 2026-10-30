export type RequestTicket = { isCurrent: () => boolean };

// One instance per result surface, never a global counter for unrelated panels.
export function createLatestRequest() {
  let revision = 0;
  let active = true;
  return {
    start(...parents: RequestTicket[]): RequestTicket {
      const version = ++revision;
      return { isCurrent: () => active && version === revision && parents.every((parent) => parent.isCurrent()) };
    },
    invalidate() { revision++; },
    activate() { if (!active) { active = true; revision++; } },
    dispose() { active = false; revision++; },
  };
}

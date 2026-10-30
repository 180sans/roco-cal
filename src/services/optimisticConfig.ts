import { createLatestRequest } from "./latestRequest";

export function createOptimisticConfig<T>(initial: T) {
  let saved = initial;
  let pending = 0;
  const requests = createLatestRequest();
  return {
    activate: requests.activate,
    dispose: requests.dispose,
    isPending: () => pending > 0,
    sync(value: T) { if (!pending) saved = value; },
    begin(next: T) {
      const request = requests.start();
      pending++;
      return {
        commit() {
          saved = next;
          pending--;
          return request.isCurrent();
        },
        rollback() {
          pending--;
          return { current: request.isCurrent(), value: saved };
        },
      };
    },
  };
}

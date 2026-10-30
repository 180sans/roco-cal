import { useEffect, useLayoutEffect, useRef, type DependencyList } from "react";
import { createLatestRequest, type RequestTicket } from "./latestRequest";

export function useLatestRequest(...dependencies: DependencyList) {
  const requests = useRef(createLatestRequest()).current;
  useLayoutEffect(() => {
    requests.activate();
    return () => requests.dispose();
  }, [requests]);
  // Invalidate during commit, before a stale Promise can publish between effects.
  useLayoutEffect(() => () => requests.invalidate(), dependencies);
  return requests;
}

export function useLatestEffect(
  effect: (request: RequestTicket) => void,
  dependencies: DependencyList,
) {
  const requests = useLatestRequest(...dependencies);
  useEffect(() => { effect(requests.start()); }, dependencies);
}

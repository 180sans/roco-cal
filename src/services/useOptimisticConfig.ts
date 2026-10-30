import { useEffect, useLayoutEffect, useRef } from "react";
import { createOptimisticConfig } from "./optimisticConfig";

export function useOptimisticConfig<T>(value: T, update: (value: T) => void) {
  const state = useRef(createOptimisticConfig(value)).current;
  useLayoutEffect(() => {
    state.activate();
    return () => state.dispose();
  }, [state]);
  useEffect(() => state.sync(value), [value]);
  const begin = (next: T) => {
    const change = state.begin(next);
    update(next);
    return {
      commit: change.commit,
      rollback() {
        const result = change.rollback();
        if (result.current) update(result.value);
        return result.current;
      },
    };
  };
  return { begin, isPending: state.isPending };
}

/** Share in-flight and settled requests without changing their Promise or errors. */
export function createPromiseCache<Key, Value>() {
  const entries = new Map<Key, Promise<Value>>();

  return (key: Key, load: () => Promise<Value>): Promise<Value> => {
    if (!entries.has(key)) entries.set(key, load());
    return entries.get(key)!;
  };
}

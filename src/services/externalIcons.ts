import { useSyncExternalStore } from "react";
import { desktopApi, externalIconUrl } from "./desktopApi";
import { type ExternalIconCatalog } from "./desktopTypes";

let catalog: ExternalIconCatalog = { directory: "", groups: { pet: {}, skill: {}, element: {}, skill_type: {} } };
let loading: Promise<void> | undefined;
const subscribers = new Set<() => void>();

function subscribeExternalIcons(notify: () => void) {
  subscribers.add(notify);
  if (!loading) {
    loading = desktopApi.externalIcons().then((next) => {
      const groups = Object.fromEntries(Object.entries(next.groups).map(([group, icons]) => [
        group, Object.fromEntries(Object.entries(icons).map(([name, path]) => [name, externalIconUrl(path)])),
      ])) as ExternalIconCatalog["groups"];
      catalog = { directory: next.directory, groups };
      for (const subscriber of subscribers) subscriber();
    }).catch((error) => {
      loading = undefined;
      console.warn("Cannot load external icons:", error);
    });
  }
  return () => { subscribers.delete(notify); };
}

function externalIconSnapshot() { return catalog; }

export function useExternalIcons() {
  return useSyncExternalStore(subscribeExternalIcons, externalIconSnapshot, externalIconSnapshot);
}

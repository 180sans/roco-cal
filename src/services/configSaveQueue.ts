import { createSerialQueue } from "./serialQueue";

export function createConfigSaver<Configs, Section extends string>(
  write: (section: Section, values: Record<string, unknown>) => Promise<{ configs: Configs }>,
) {
  const enqueue = createSerialQueue();
  // Include publication and existing pre-publication effects in the same queue.
  // Each application supplies its own transport and owns its own queue instance.
  return function savePatch(
    section: Section,
    values: Record<string, unknown>,
    publish: (configs: Configs) => void,
    lifecycle?: { beforeWrite?: () => Promise<unknown>; beforePublish?: () => Promise<unknown> },
  ) {
    return enqueue(async () => {
      if (lifecycle?.beforeWrite) await lifecycle.beforeWrite();
      const result = await write(section, values);
      if (lifecycle?.beforePublish) await lifecycle.beforePublish();
      publish(result.configs);
      return result;
    });
  };
}



function asError(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export { asError };

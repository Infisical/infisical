export const executeIfDefined = <T, R>(func: (input: T) => R, input: T | undefined): R | undefined => {
  return input === undefined ? undefined : func(input);
};

// Used when update in some fields during patch will create a side-effect
export const isPatchValueChanged = (next: unknown, current: unknown) =>
  next !== undefined && next !== (current ?? null);

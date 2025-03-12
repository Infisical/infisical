export const executeIfDefined = <T, R>(func: (input: T) => R, input: T | undefined): R | undefined =>
  input === undefined ? undefined : func(input);

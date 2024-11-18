export const executeIfDefined = <T, R>(func: (input: T) => R, input: T | undefined): R | undefined => {
  return input === undefined ? undefined : func(input);
};

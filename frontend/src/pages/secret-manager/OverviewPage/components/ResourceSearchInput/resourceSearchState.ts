type ResourceSearchState = {
  externalValue: string;
  previousExternalValue: string;
  debouncedInputValue: string;
  lastEmittedValue: string;
};

export type ResourceSearchStateTransition =
  | { type: "sync"; value: string }
  | { type: "emit"; value: string };

export const getResourceSearchStateTransition = ({
  externalValue,
  previousExternalValue,
  debouncedInputValue,
  lastEmittedValue
}: ResourceSearchState): ResourceSearchStateTransition | undefined => {
  if (externalValue !== previousExternalValue) {
    return { type: "sync", value: externalValue };
  }

  if (debouncedInputValue !== lastEmittedValue) {
    return { type: "emit", value: debouncedInputValue };
  }

  return undefined;
};

import msFn from "ms";

export const ms = (val: string) => {
  if (typeof val !== "string") {
    throw new Error("Date must be string");
  }

  try {
    return msFn(val);
  } catch {
    throw new Error(`Invalid date format string: ${val}`);
  }
};

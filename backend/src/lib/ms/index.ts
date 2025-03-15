import msFn, { StringValue } from "ms";

import { BadRequestError } from "../errors";

export const ms = (val: string) => {
  if (typeof val !== "string") {
    throw new BadRequestError({ message: `Date must be string` });
  }

  try {
    return msFn(val as StringValue);
  } catch {
    throw new BadRequestError({ message: `Invalid date format string: ${val}` });
  }
};

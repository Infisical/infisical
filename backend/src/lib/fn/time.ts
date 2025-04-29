const convertToMilliseconds = (exp: string | number): number => {
  if (typeof exp === "number") {
    return exp * 1000;
  }

  const match = exp.match(/^(\d+)\s*([a-z]*)$/i);
  if (!match) {
    throw new Error(`Invalid expiration format: ${exp}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "":
    case "s":
      return value * 1000; // seconds
    case "m":
      return value * 60 * 1000; // minutes
    case "h":
      return value * 60 * 60 * 1000; // hours
    case "d":
      return value * 24 * 60 * 60 * 1000; // days
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
};

export const getMinExpiresIn = (exp1: string | number, exp2: string | number): string | number => {
  const ms1 = convertToMilliseconds(exp1);
  const ms2 = convertToMilliseconds(exp2);

  return ms1 <= ms2 ? exp1 : exp2;
};

import ms, { StringValue } from "ms";

const convertToMilliseconds = (exp: string | number): number => {
  if (typeof exp === "number") {
    return exp * 1000;
  }

  const result = ms(exp as StringValue);
  if (typeof result !== "number") {
    throw new Error(`Invalid expiration format: ${exp}`);
  }

  return result;
};

export const getMinExpiresIn = (exp1: string | number, exp2: string | number): string | number => {
  const ms1 = convertToMilliseconds(exp1);
  const ms2 = convertToMilliseconds(exp2);

  return ms1 <= ms2 ? exp1 : exp2;
};

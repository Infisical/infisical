import RE2 from "re2";

const validRegionPattern = new RE2("^[a-z0-9-]+$");

export const isValidAwsRegion = (region: string | null): boolean => {
  if (typeof region !== "string" || region.length === 0 || region.length > 20) return false;
  return validRegionPattern.test(region);
};

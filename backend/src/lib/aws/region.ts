import RE2 from "re2";

// Shaped like a real region so sts.<region>.amazonaws.com can only be an STS endpoint, never e.g. sts.s3.amazonaws.com
const validRegionPattern = new RE2("^[a-z]+(-[a-z]+)+-[0-9]+$");

export const isValidAwsRegion = (region: string | null): boolean => {
  if (typeof region !== "string" || region.length === 0 || region.length > 20) return false;
  return validRegionPattern.test(region);
};

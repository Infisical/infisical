export const INSTANCE_RELAY_PREFIX = "infisical-";

export const isInstanceRelay = (relayName: string) => {
  return relayName.startsWith(INSTANCE_RELAY_PREFIX);
};

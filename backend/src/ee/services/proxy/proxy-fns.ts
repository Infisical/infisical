export const INSTANCE_PROXY_PREFIX = "infisical-";

export const isInstanceProxy = (proxyName: string) => {
  return proxyName.startsWith(INSTANCE_PROXY_PREFIX);
};

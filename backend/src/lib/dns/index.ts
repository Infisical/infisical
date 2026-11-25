import dns from "node:dns/promises";

const MAX_CNAME_HOPS = 10;

export const followCnameChain = async (
  hostname: string,
  onResolveError: (error: NodeJS.ErrnoException, hostname: string) => void
) => {
  let current = hostname;
  for (let hop = 0; hop < MAX_CNAME_HOPS; hop += 1) {
    const lookedUp = current;
    // eslint-disable-next-line no-await-in-loop
    const [target] = await dns.resolveCname(lookedUp).catch((error: NodeJS.ErrnoException): string[] => {
      onResolveError(error, lookedUp);
      return [];
    });
    if (!target) return current;
    current = target;
  }
  return current;
};

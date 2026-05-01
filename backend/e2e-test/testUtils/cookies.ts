import { type LightMyRequestResponse } from "fastify";

export const extractCookie = (res: LightMyRequestResponse, name: string): string | undefined => {
  const cookies = res.headers["set-cookie"];
  if (!cookies) return undefined;

  const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
  for (const cookie of cookieArray) {
    const match = cookie.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
};

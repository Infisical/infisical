import type { BrowserContext } from "@playwright/test";

import { InfisicalApi } from "./api.js";

/**
 * Pre-authenticates a browser context without driving the login UI.
 *
 * This is only possible because of two properties of the current app, both verified in
 * source rather than assumed:
 *
 *  1. `POST /api/v3/auth/login` is a plain email+password route. SRP survives as
 *     login1/login2, but the frontend does not use it and login2 never verifies the client
 *     proof anyway (auth-login-service.ts does a bcrypt compare).
 *
 *  2. There is no client-side private key to reconstruct. E2EE is gone: every localStorage
 *     reference left in frontend/ is a logout-time removeItem, nothing ever reads them
 *     back, and the mutation hook is literally named useAddUserToWsNonE2EE.
 *
 * So the durable session is exactly one httpOnly cookie. The access token itself lives only
 * in a module-closure variable (reactQuery.tsx MemoryTokenStorage), which is why seeding
 * localStorage does nothing and injecting the cookie is the approach that works: on first
 * navigation the route guard calls POST /api/v1/auth/token and mints its own in-memory
 * token from the cookie.
 */

export type BrowserSession = {
  /** Org-scoped access token, for API calls the fixture makes alongside the browser. */
  accessToken: string;
  organizationId: string;
  email: string;
};

export type SessionCredentials = {
  email: string;
  password: string;
  organizationId: string;
};

/**
 * Two API calls, then one cookie.
 *
 * select-organization is not optional: the token from login carries no organizationId, and
 * authenticate.tsx redirects to /login/select-organization until it does. Skipping it lands
 * the agent on an org picker instead of the page under test.
 */
export const createBrowserSession = async (
  context: BrowserContext,
  baseUrl: string,
  credentials: SessionCredentials
): Promise<BrowserSession> => {
  const api = new InfisicalApi(baseUrl);

  const login = await api.login(credentials.email, credentials.password);
  const scoped = await api.selectOrganization(login.accessToken, credentials.organizationId);

  if (!scoped.jid) {
    throw new Error(
      "select-organization returned no jid cookie. The browser cannot be pre-authenticated " +
        "without it; check that the response still sets a refresh cookie."
    );
  }

  const { hostname } = new URL(baseUrl);

  await context.addCookies([
    {
      name: "jid",
      value: scoped.jid,
      domain: hostname,
      // The backend scopes the cookie to /api. Playwright sets httpOnly cookies through
      // CDP rather than document.cookie, so this works where a page script could not.
      path: "/api",
      httpOnly: true,
      secure: baseUrl.startsWith("https://"),
      sameSite: "Strict"
    }
  ]);

  return {
    accessToken: scoped.token,
    organizationId: credentials.organizationId,
    email: credentials.email
  };
};

/**
 * Refresh tokens rotate on every POST /api/v1/auth/token, so one harvested `jid` is good
 * for exactly one browser context. Anything that needs a second concurrent context (a
 * two-principal approval flow) must mint its own rather than reuse this one.
 */
export const assertSingleContextUse = (used: boolean): void => {
  if (used) {
    throw new Error(
      "This jid cookie has already seeded a browser context. Refresh tokens rotate on use, " +
        "so mint a fresh session per context instead of sharing one."
    );
  }
};

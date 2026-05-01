import { extractCookie } from "./cookies";

export const loginUser = async (email: string, password: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v3/auth/login",
    body: { email, password }
  });
  expect(res.statusCode).toBe(200);
  const payload = res.json();
  const refreshCookie = extractCookie(res, "jid");
  return { accessToken: payload.accessToken as string, refreshCookie };
};

export const selectOrg = async (accessToken: string, organizationId: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v3/auth/select-organization",
    headers: { authorization: `Bearer ${accessToken}` },
    body: { organizationId }
  });
  return { statusCode: res.statusCode, payload: res.json(), res };
};

// Refuses to follow HTTP redirects when talking to an MCP server. The server URL
// is validated against private IPs at registration time; without this, a 302 at
// request time could redirect the backend fetch to internal network addresses.
export const ssrfSafeMcpFetch = (url: string | URL, init?: RequestInit): Promise<Response> =>
  fetch(url, { ...init, redirect: "manual" });

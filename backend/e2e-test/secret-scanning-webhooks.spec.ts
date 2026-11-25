// The shared test server boots without INF_APP_CONNECTION_GITHUB_RADAR_*, so these cases cover the
// unconfigured deployment. Registration used to bail out entirely when the GitHub Radar app was
// missing, which took the Bitbucket and GitLab webhooks down with it even though neither touches it.
describe("secret scanning v2 webhooks without a GitHub Radar app", () => {
  test.each([
    { provider: "bitbucket", url: "/secret-scanning/webhooks/bitbucket" },
    { provider: "gitlab", url: "/secret-scanning/webhooks/gitlab" }
  ])("registers the $provider webhook", ({ url }) => {
    expect(testServer.hasRoute({ method: "POST", url })).toBe(true);
  });

  // The route is registered so an admin's Radar override applies without a restart; while the app is not configured it
  // answers exactly as an absent route does (404 rather than 401: nothing is there, not refusing the caller).
  test("answers the github webhook as an absent route", async () => {
    const res = await testServer.inject({ method: "POST", url: "/secret-scanning/webhooks/github" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ message: "Route POST:/secret-scanning/webhooks/github not found" });
  });
});

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

  test("does not register the github webhook", async () => {
    expect(testServer.hasRoute({ method: "POST", url: "/secret-scanning/webhooks/github" })).toBe(false);

    // 404 rather than 401: the route is absent, not merely refusing the caller.
    const res = await testServer.inject({ method: "POST", url: "/secret-scanning/webhooks/github" });
    expect(res.statusCode).toBe(404);
  });
});

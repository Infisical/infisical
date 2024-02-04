describe("Status V1 Router", async () => {
  test("Simple check", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(res.statusCode).toBe(200);
  });
});

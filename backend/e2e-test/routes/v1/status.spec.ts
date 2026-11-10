describe("Status V1 Router", async () => {
  test("Simple check", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(res.statusCode).toBe(200);
  });

  test("Omits the AWS account ID when the instance has no AWS identity", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).not.toHaveProperty("awsAccountId");
  });
});

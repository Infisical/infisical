describe("Instance V1 Router", async () => {
  test("Refuses the AWS deployment metadata without authentication", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/instance/deployment/aws/metadata"
    });
    expect(res.statusCode).toBe(401);
  });

  test("Returns a null AWS account ID when the instance has no AWS identity", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/instance/deployment/aws/metadata",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ metadata: { accountId: null } });
  });

  test("No longer reports the AWS account ID on the public status endpoint", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).not.toHaveProperty("awsAccountId");
  });
});

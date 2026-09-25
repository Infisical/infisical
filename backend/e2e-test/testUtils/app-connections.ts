// An app connection is org-scoped and shared by every feature that reaches a third party, so the
// helpers live here rather than with the first feature that needed one. Names carry the app: the
// route, the credential shape and the response are all per-app.
//
// The AWS connection is faked for the whole e2e run (e2e-test/fakes/aws-connection-fns.ts and the
// alias block in vitest.e2e.config.mts), so these credentials are never validated against AWS.

export const createAwsAppConnection = async (dto: { name: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/app-connections/aws`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      name: dto.name,
      method: "access-key",
      credentials: {
        accessKeyId: "AKIAFAKEACCESSKEYID",
        secretAccessKey: "fake-secret-access-key"
      }
    }
  });

  expect(res.statusCode).toBe(200);
  return res.json().appConnection.id as string;
};

export const deleteAwsAppConnection = async (dto: { connectionId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/app-connections/aws/${dto.connectionId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(200);
};

type TStaticSecretsValidationRule = {
  id: string;
  name: string;
  secretPath: string;
  environment: { id: string; name: string; slug: string } | null;
};

export const createStaticSecretsValidationRule = async (dto: {
  projectId: string;
  name: string;
  environment?: string;
  secretPath?: string;
  valueConstraints?: Record<string, unknown>;
  keyConstraints?: Record<string, unknown>;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/secret-validation-rules/static-secrets",
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      projectId: dto.projectId,
      name: dto.name,
      environment: dto.environment,
      secretPath: dto.secretPath ?? "/",
      keyConstraints: dto.keyConstraints,
      valueConstraints: dto.valueConstraints
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().secretValidationRule as TStaticSecretsValidationRule;
};

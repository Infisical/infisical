import { apiRequest } from "@app/config/request";

export const fetchProjectSecrets = async ({
  workspaceId,
  environment,
  secretPath,
  includeImports,
  expandSecretReferences
}: TGetProjectSecretsKey) => {
  const { data } = await apiRequest.get<SecretV3RawResponse>("/api/v3/secrets/raw", {
    params: {
      environment,
      workspaceId,
      secretPath,
      expandSecretReferences,
      include_imports: includeImports
    }
  });

  return data;
};

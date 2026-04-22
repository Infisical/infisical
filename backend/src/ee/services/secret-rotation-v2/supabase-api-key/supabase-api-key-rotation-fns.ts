import { TRotationFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";

import { TSupabaseApiKeyRotationGeneratedCredentials, TSupabaseApiKeyRotationWithConnection } from "./supabase-api-key-rotation-types";

export const supabaseApiKeyRotationFactory: TRotationFactory<
  TSupabaseApiKeyRotationWithConnection,
  TSupabaseApiKeyRotationGeneratedCredentials
> = (_secretRotation) => {
  const issueCredentials: ReturnType<
    TRotationFactory<TSupabaseApiKeyRotationWithConnection, TSupabaseApiKeyRotationGeneratedCredentials>
  >["issueCredentials"] = async (callback) => {
    // TODO: Implement Supabase API key issuance
    const newCredentials = {
      apiKey: ""
    };

    return callback(newCredentials);
  };

  const revokeCredentials: ReturnType<
    TRotationFactory<TSupabaseApiKeyRotationWithConnection, TSupabaseApiKeyRotationGeneratedCredentials>
  >["revokeCredentials"] = async (_generatedCredentials, callback) => {
    // TODO: Implement Supabase API key revocation
    return callback();
  };

  const rotateCredentials: ReturnType<
    TRotationFactory<TSupabaseApiKeyRotationWithConnection, TSupabaseApiKeyRotationGeneratedCredentials>
  >["rotateCredentials"] = async (_credentialsToRevoke, callback) => {
    // TODO: Implement Supabase API key rotation
    const newCredentials = {
      apiKey: ""
    };

    return callback(newCredentials);
  };

  const getSecretsPayload: ReturnType<
    TRotationFactory<TSupabaseApiKeyRotationWithConnection, TSupabaseApiKeyRotationGeneratedCredentials>
  >["getSecretsPayload"] = (generatedCredentials) => {
    return [{ key: "apiKey", value: generatedCredentials.apiKey }];
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};

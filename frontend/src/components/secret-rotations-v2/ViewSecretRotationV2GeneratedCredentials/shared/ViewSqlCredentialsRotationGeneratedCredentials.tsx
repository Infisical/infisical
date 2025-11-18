import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { ViewRotationGeneratedCredentialsDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/ViewRotationGeneratedCredentialsDisplay";
import { TMongoDBCredentialsRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/mongodb-credentials-rotation";
import { TMsSqlCredentialsRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/mssql-credentials-rotation";
import { TMySqlCredentialsRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/mysql-credentials-rotation";
import { TOracleDBCredentialsRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/oracledb-credentials-rotation";
import { TPostgresCredentialsRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/postgres-credentials-rotation";

type Props = {
  generatedCredentialsResponse:
    | TMsSqlCredentialsRotationGeneratedCredentialsResponse
    | TMySqlCredentialsRotationGeneratedCredentialsResponse
    | TOracleDBCredentialsRotationGeneratedCredentialsResponse
    | TPostgresCredentialsRotationGeneratedCredentialsResponse
    | TMongoDBCredentialsRotationGeneratedCredentialsResponse;
};

export const ViewSqlCredentialsRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Username">{activeCredentials?.username}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Password">
            {activeCredentials?.password}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Username">{inactiveCredentials?.username}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Password">
            {inactiveCredentials?.password}
          </CredentialDisplay>
        </>
      }
    />
  );
};

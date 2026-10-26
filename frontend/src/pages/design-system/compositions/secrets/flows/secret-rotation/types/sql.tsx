import { useWatch } from "react-hook-form";

import { Grid, Stack } from "@app/components/v4/ui/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v4/ui/tabs";

import {
  CreateUserStatementAlert,
  PasswordRequirementsFields,
  ReviewSection,
  type RotationViews,
  SecretsMappingFields,
  TextField,
  useRotationForm
} from "../fields";
import { ROTATION_TEMPLATES } from "../model";
import { DEFAULT_PASSWORD_REQUIREMENTS, SecretRotation } from "../schemas";

type SqlRotation =
  | SecretRotation.PostgresCredentials
  | SecretRotation.MsSqlCredentials
  | SecretRotation.MySqlCredentials
  | SecretRotation.OracleDBCredentials;

const useType = () => {
  const { control } = useRotationForm();
  return useWatch({ control, name: "type" }) as SecretRotation;
};

function SqlParameters() {
  const type = useType() as SqlRotation;
  const template = ROTATION_TEMPLATES[type];
  const isOracle = type === SecretRotation.OracleDBCredentials;
  return (
    <Tabs defaultValue="statement">
      <TabsList>
        <TabsTrigger value="statement">General</TabsTrigger>
        <TabsTrigger value="advance">Advanced</TabsTrigger>
      </TabsList>
      <TabsContent value="statement">
        <Stack gap={16}>
          <Grid columns={2} gap={8}>
            <TextField
              name="parameters.username1"
              label="Database Username 1"
              placeholder={isOracle ? "INFISICAL_USER_1" : "infisical_user_1"}
            />
            <TextField
              name="parameters.username2"
              label="Database Username 2"
              placeholder={isOracle ? "INFISICAL_USER_2" : "infisical_user_2"}
            />
          </Grid>
          <CreateUserStatementAlert statement={template.createUserStatement ?? ""} />
        </Stack>
      </TabsContent>
      <TabsContent value="advance">
        <Stack gap={16}>
          <TextField
            name="parameters.rotationStatement"
            label="Rotation Statement"
            description="username, password and database are dynamically provisioned"
            defaultValue={template.rotationStatement}
            multiline
            rows={3}
          />
          <PasswordRequirementsFields
            defaultRequirements={{
              ...DEFAULT_PASSWORD_REQUIREMENTS,
              length: isOracle ? 30 : DEFAULT_PASSWORD_REQUIREMENTS.length
            }}
          />
        </Stack>
      </TabsContent>
    </Tabs>
  );
}

function MongoParameters() {
  return (
    <>
      <TextField
        name="parameters.username1"
        label="Database Username 1"
        placeholder="infisical_user_1"
      />
      <TextField
        name="parameters.username2"
        label="Database Username 2"
        placeholder="infisical_user_2"
      />
      <CreateUserStatementAlert
        statement={ROTATION_TEMPLATES[SecretRotation.MongoDBCredentials].createUserStatement ?? ""}
      />
    </>
  );
}

function CredentialsMappings() {
  const { secretsMapping } = ROTATION_TEMPLATES[useType()];
  return (
    <SecretsMappingFields
      items={[
        { name: "Username", key: "username", placeholder: secretsMapping.username },
        { name: "Password", key: "password", placeholder: secretsMapping.password }
      ]}
    />
  );
}

function CredentialsReview() {
  const { control } = useRotationForm();
  const [parameters, mapping] = useWatch({ control, name: ["parameters", "secretsMapping"] });
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Database Username 1", parameters?.username1],
          ["Database Username 2", parameters?.username2]
        ]}
      />
      <ReviewSection
        label="Secrets Mapping"
        items={[
          ["Username", mapping?.username],
          ["Password", mapping?.password]
        ]}
      />
    </>
  );
}

const sql: RotationViews = {
  Parameters: SqlParameters,
  Mappings: CredentialsMappings,
  Review: CredentialsReview
};

export const sqlRotationViews = {
  [SecretRotation.PostgresCredentials]: sql,
  [SecretRotation.MsSqlCredentials]: sql,
  [SecretRotation.MySqlCredentials]: sql,
  [SecretRotation.OracleDBCredentials]: sql,
  [SecretRotation.MongoDBCredentials]: {
    Parameters: MongoParameters,
    Mappings: CredentialsMappings,
    Review: CredentialsReview
  }
} satisfies Partial<Record<SecretRotation, RotationViews>>;

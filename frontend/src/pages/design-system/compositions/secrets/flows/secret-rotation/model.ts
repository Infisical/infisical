import { AppConnection, CloudflareR2AccessLevel, SecretRotation } from "./schemas";

export type RotationEnvironment = { id: string; slug: string; name: string };
export type RotationConnection = { id: string; name: string; app: AppConnection };

export const APP_CONNECTION_NAME: Partial<Record<AppConnection, string>> = {
  [AppConnection.Postgres]: "PostgreSQL",
  [AppConnection.MsSql]: "Microsoft SQL Server",
  [AppConnection.MySql]: "MySQL",
  [AppConnection.OracleDB]: "OracleDB",
  [AppConnection.Auth0]: "Auth0",
  [AppConnection.AzureClientSecrets]: "Azure Client Secrets",
  [AppConnection.LDAP]: "LDAP",
  [AppConnection.AWS]: "AWS",
  [AppConnection.Okta]: "Okta",
  [AppConnection.Redis]: "Redis",
  [AppConnection.MongoDB]: "MongoDB",
  [AppConnection.Databricks]: "Databricks",
  [AppConnection.SSH]: "SSH",
  [AppConnection.Dbt]: "DBT",
  [AppConnection.SMB]: "Windows (SMB)",
  [AppConnection.OpenRouter]: "OpenRouter",
  [AppConnection.LiteLLM]: "LiteLLM",
  [AppConnection.OpenAI]: "OpenAI",
  [AppConnection.HpeIloRedFish]: "HPE iLO",
  [AppConnection.Supabase]: "Supabase",
  [AppConnection.Salesforce]: "Salesforce",
  [AppConnection.Datadog]: "Datadog",
  [AppConnection.Convex]: "Convex",
  [AppConnection.Fireworks]: "Fireworks",
  [AppConnection.Snowflake]: "Snowflake",
  [AppConnection.Cloudflare]: "Cloudflare",
  [AppConnection.Stripe]: "Stripe",
  [AppConnection.GCP]: "GCP"
};
export const appConnectionName = (app: AppConnection) => APP_CONNECTION_NAME[app] ?? app;

const CONNECTION_NAMES: [AppConnection, string[]][] = [
  [AppConnection.Postgres, ["payments-postgres", "ledger-postgres"]],
  [AppConnection.MsSql, ["reporting-mssql"]],
  [AppConnection.MySql, ["legacy-mysql"]],
  [AppConnection.OracleDB, ["finance-oracle"]],
  [AppConnection.Auth0, ["payments-auth0"]],
  [AppConnection.AzureClientSecrets, ["payments-entra"]],
  [AppConnection.LDAP, ["corp-ldap"]],
  [AppConnection.AWS, ["aws-production"]],
  [AppConnection.Okta, ["payments-okta"]],
  [AppConnection.Redis, ["cache-redis"]],
  [AppConnection.MongoDB, ["events-mongodb"]],
  [AppConnection.Databricks, ["analytics-databricks"]],
  [AppConnection.SSH, ["bastion-ssh"]],
  [AppConnection.Dbt, ["analytics-dbt"]],
  [AppConnection.SMB, ["billing-windows"]],
  [AppConnection.OpenRouter, ["payments-openrouter"]],
  [AppConnection.LiteLLM, ["internal-litellm"]],
  [AppConnection.OpenAI, ["payments-openai"]],
  [AppConnection.HpeIloRedFish, ["rack-a-ilo"]],
  [AppConnection.Supabase, ["web-supabase"]],
  [AppConnection.Salesforce, ["sales-salesforce"]],
  [AppConnection.Datadog, ["observability-datadog"]],
  [AppConnection.Convex, ["web-convex"]],
  [AppConnection.Fireworks, ["inference-fireworks"]],
  [AppConnection.Snowflake, ["warehouse-snowflake"]],
  [AppConnection.Cloudflare, ["edge-cloudflare"]],
  [AppConnection.Stripe, ["payments-stripe"]],
  [AppConnection.GCP, ["payments-gcp"]]
];

export const LOCAL_ROTATION_CONNECTIONS: RotationConnection[] = CONNECTION_NAMES.flatMap(
  ([app, names]) => names.map((name) => ({ name, app }))
).map((connection, index) => ({
  ...connection,
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
}));

type RotationTemplate = {
  createUserStatement?: string;
  rotationStatement?: string;
  parameters?: Record<string, unknown>;
  secretsMapping: Record<string, string>;
};

export const ROTATION_TEMPLATES: Record<SecretRotation, RotationTemplate> = {
  [SecretRotation.PostgresCredentials]: {
    createUserStatement: [
      "-- create user role",
      "CREATE USER infisical_user WITH ENCRYPTED PASSWORD 'temporary_password';",
      "   ",
      "-- grant database connection permissions",
      "GRANT CONNECT ON DATABASE my_database TO infisical_user;",
      "   ",
      "-- grant relevant table permissions",
      "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO infisical_user;"
    ].join("\n"),
    rotationStatement: ["ALTER USER \"{{username}}\" WITH PASSWORD '{{password}}'"].join("\n"),
    secretsMapping: { username: "POSTGRES_DB_USERNAME", password: "POSTGRES_DB_PASSWORD" }
  },
  [SecretRotation.MsSqlCredentials]: {
    createUserStatement: [
      "-- Create login at the server level",
      "CREATE LOGIN [infisical_user] WITH PASSWORD = 'my-password';",
      "",
      "-- Grant server-level connect permission",
      "GRANT CONNECT SQL TO [infisical_user];",
      "",
      "-- Switch to the database where you want to create the user",
      "USE my_database;",
      "",
      "-- Create the database user mapped to the login",
      "CREATE USER [infisical_user] FOR LOGIN [infisical_user];",
      "",
      "-- Grant permissions to the user on the schema in this database",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [infisical_user];"
    ].join("\n"),
    rotationStatement: ["ALTER LOGIN [{{username}}] WITH PASSWORD = '{{password}}'"].join("\n"),
    secretsMapping: { username: "MSSQL_DB_USERNAME", password: "MSSQL_DB_PASSWORD" }
  },
  [SecretRotation.MySqlCredentials]: {
    createUserStatement: [
      "-- create user",
      "CREATE USER 'infisical_user'@'%' IDENTIFIED BY 'temporary_password';",
      "",
      "-- grant all privileges",
      "GRANT ALL PRIVILEGES ON my_database.* TO 'infisical_user'@'%';",
      "",
      "-- apply the privilege changes",
      "FLUSH PRIVILEGES;"
    ].join("\n"),
    rotationStatement: ["ALTER USER '{{username}}'@'%' IDENTIFIED BY '{{password}}'"].join("\n"),
    secretsMapping: { username: "MYSQL_USERNAME", password: "MYSQL_PASSWORD" }
  },
  [SecretRotation.OracleDBCredentials]: {
    createUserStatement: [
      "-- create user",
      'CREATE USER INFISICAL_USER IDENTIFIED BY "temporary_password";',
      "",
      "-- grant all privileges",
      "GRANT ALL PRIVILEGES TO INFISICAL_USER;"
    ].join("\n"),
    rotationStatement: ['ALTER USER "{{username}}" IDENTIFIED BY "{{password}}"'].join("\n"),
    secretsMapping: { username: "ORACLEDB_USERNAME", password: "ORACLEDB_PASSWORD" }
  },
  [SecretRotation.MongoDBCredentials]: {
    createUserStatement: [
      "use [DATABASE_NAME]",
      "db.createUser({",
      '  user: "infisical_user_1",',
      '  pwd: "temporary_password",',
      '  roles: [{ role: "readWrite", db: "[DATABASE_NAME]" }]',
      "})",
      "",
      "db.createUser({",
      '  user: "infisical_user_2",',
      '  pwd: "temporary_password",',
      '  roles: [{ role: "readWrite", db: "[DATABASE_NAME]" }]',
      "})"
    ].join("\n"),
    secretsMapping: { username: "MONGODB_DB_USERNAME", password: "MONGODB_DB_PASSWORD" }
  },
  [SecretRotation.Auth0ClientSecret]: {
    secretsMapping: { clientId: "AUTH0_CLIENT_ID", clientSecret: "AUTH0_CLIENT_SECRET" }
  },
  [SecretRotation.AzureClientSecret]: {
    secretsMapping: { clientId: "AZURE_CLIENT_ID", clientSecret: "AZURE_CLIENT_SECRET" }
  },
  [SecretRotation.LdapPassword]: {
    secretsMapping: { dn: "LDAP_DN", password: "LDAP_PASSWORD" }
  },
  [SecretRotation.AwsIamUserSecret]: {
    secretsMapping: { accessKeyId: "AWS_ACCESS_KEY_ID", secretAccessKey: "AWS_SECRET_ACCESS_KEY" }
  },
  [SecretRotation.OktaClientSecret]: {
    secretsMapping: { clientId: "OKTA_CLIENT_ID", clientSecret: "OKTA_CLIENT_SECRET" }
  },
  [SecretRotation.RedisCredentials]: {
    secretsMapping: { username: "REDIS_USERNAME", password: "REDIS_PASSWORD" }
  },
  [SecretRotation.DatabricksServicePrincipalSecret]: {
    secretsMapping: { clientId: "DATABRICKS_CLIENT_ID", clientSecret: "DATABRICKS_CLIENT_SECRET" }
  },
  [SecretRotation.UnixLinuxLocalAccount]: {
    secretsMapping: { username: "UNIX_USERNAME", password: "UNIX_PASSWORD" }
  },
  [SecretRotation.DbtServiceToken]: {
    secretsMapping: { serviceToken: "DBT_SERVICE_TOKEN" }
  },
  [SecretRotation.WindowsLocalAccount]: {
    secretsMapping: { username: "WINDOWS_USERNAME", password: "WINDOWS_PASSWORD" }
  },
  [SecretRotation.OpenRouterApiKey]: {
    secretsMapping: { apiKey: "OPEN_ROUTER_API_KEY" }
  },
  [SecretRotation.LiteLLMApiKey]: {
    secretsMapping: { apiKey: "LITELLM_API_KEY" }
  },
  [SecretRotation.OpenAIServiceAccount]: {
    secretsMapping: { apiKey: "OPENAI_API_KEY" }
  },
  [SecretRotation.HpIloLocalAccount]: {
    secretsMapping: { username: "ILO_USERNAME", password: "ILO_PASSWORD" }
  },
  [SecretRotation.SupabaseApiKey]: {
    secretsMapping: { apiKey: "SUPABASE_API_KEY" }
  },
  [SecretRotation.SalesforceOauthCredentials]: {
    secretsMapping: {
      consumerKey: "SALESFORCE_CONSUMER_KEY",
      consumerSecret: "SALESFORCE_CONSUMER_SECRET"
    }
  },
  [SecretRotation.DatadogApplicationKeySecret]: {
    secretsMapping: {
      applicationKeyId: "DATADOG_APPLICATION_KEY_ID",
      applicationKey: "DATADOG_APPLICATION_KEY"
    }
  },
  [SecretRotation.DatadogApiKey]: {
    secretsMapping: { apiKeyId: "DATADOG_API_KEY_ID", apiKey: "DATADOG_API_KEY" }
  },
  [SecretRotation.ConvexAccessKey]: {
    secretsMapping: { accessKey: "CONVEX_ACCESS_KEY" }
  },
  [SecretRotation.FireworksApiKey]: {
    secretsMapping: { apiKey: "FIREWORKS_API_KEY" }
  },
  [SecretRotation.SnowflakeUserKeyPair]: {
    secretsMapping: { privateKey: "SNOWFLAKE_PRIVATE_KEY", publicKey: "SNOWFLAKE_PUBLIC_KEY" }
  },
  [SecretRotation.CloudflareApiToken]: {
    secretsMapping: { tokenId: "CLOUDFLARE_API_TOKEN_ID", apiToken: "CLOUDFLARE_API_TOKEN" }
  },
  [SecretRotation.CloudflareR2AccessKey]: {
    parameters: { accessLevel: CloudflareR2AccessLevel.ObjectRead },
    secretsMapping: {
      accessKeyId: "CLOUDFLARE_R2_ACCESS_KEY_ID",
      secretAccessKey: "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
    }
  },
  [SecretRotation.StripeApiKey]: {
    secretsMapping: { apiKey: "STRIPE_API_KEY" }
  },
  [SecretRotation.GcpServiceAccountKey]: {
    secretsMapping: { serviceAccountKey: "GCP_SERVICE_ACCOUNT_KEY" }
  }
};

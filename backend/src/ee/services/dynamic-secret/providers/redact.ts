import { DynamicSecretProviders } from "./models";

export const DYNAMIC_SECRET_SECRET_FIELDS: Record<DynamicSecretProviders, readonly string[]> = {
  [DynamicSecretProviders.Ssh]: ["caPrivateKey"],
  [DynamicSecretProviders.SqlDatabase]: [],
  [DynamicSecretProviders.Clickhouse]: [],
  [DynamicSecretProviders.Cassandra]: [],
  [DynamicSecretProviders.AwsIam]: [],
  [DynamicSecretProviders.Redis]: [],
  [DynamicSecretProviders.AwsElastiCache]: [],
  [DynamicSecretProviders.AwsMemoryDb]: [],
  [DynamicSecretProviders.MongoAtlas]: [],
  [DynamicSecretProviders.ElasticSearch]: [],
  [DynamicSecretProviders.MongoDB]: [],
  [DynamicSecretProviders.RabbitMq]: [],
  [DynamicSecretProviders.AzureEntraID]: [],
  [DynamicSecretProviders.AzureSqlDatabase]: [],
  [DynamicSecretProviders.Ldap]: [],
  [DynamicSecretProviders.SapHana]: [],
  [DynamicSecretProviders.Snowflake]: [],
  [DynamicSecretProviders.Totp]: [],
  [DynamicSecretProviders.SapAse]: [],
  [DynamicSecretProviders.Kubernetes]: [],
  [DynamicSecretProviders.Vertica]: [],
  [DynamicSecretProviders.GcpIam]: [],
  [DynamicSecretProviders.Github]: [],
  [DynamicSecretProviders.Couchbase]: [],
  [DynamicSecretProviders.Milvus]: [],
  [DynamicSecretProviders.IbmApiConnect]: [],
  [DynamicSecretProviders.Tailscale]: [],
  [DynamicSecretProviders.OAuth2]: ["clientAuth.clientSecret"],
  [DynamicSecretProviders.Kafka]: [],
  [DynamicSecretProviders.OpenRouter]: ["managementKey"],
  [DynamicSecretProviders.Neon]: ["apiKey"]
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const omitPath = (value: unknown, [head, ...rest]: string[]): unknown => {
  if (!isPlainObject(value) || !(head in value)) return value;
  if (!rest.length) return Object.fromEntries(Object.entries(value).filter(([field]) => field !== head));
  return { ...value, [head]: omitPath(value[head], rest) };
};

const getPath = (value: unknown, path: string[]): unknown =>
  path.reduce<unknown>((current, segment) => (isPlainObject(current) ? current[segment] : undefined), value);

const setPath = (
  value: Record<string, unknown>,
  [head, ...rest]: string[],
  fieldValue: unknown
): Record<string, unknown> => {
  if (!rest.length) return { ...value, [head]: fieldValue };
  const child = value[head];
  if (!isPlainObject(child)) return value;
  return { ...value, [head]: setPath(child, rest, fieldValue) };
};

export const redactStoredInputs = (type: DynamicSecretProviders, inputs: unknown): unknown => {
  const secretFields = DYNAMIC_SECRET_SECRET_FIELDS[type];
  if (!secretFields?.length || !isPlainObject(inputs)) return inputs;

  return secretFields.reduce<unknown>((acc, field) => omitPath(acc, field.split(".")), inputs);
};

export const getOmittedSecretFields = (
  type: DynamicSecretProviders,
  storedInputs: object,
  updateInputs: unknown
): string[] =>
  (DYNAMIC_SECRET_SECRET_FIELDS[type] ?? []).filter((field) => {
    const path = field.split(".");
    return getPath(storedInputs, path) !== undefined && getPath(updateInputs, path) === undefined;
  });

// reads never return secret fields, so an edit that leaves one out keeps the stored value; the provider
// schema drops it again if the edit switched to a shape that has no such field
export const restoreOmittedSecretFields = (
  type: DynamicSecretProviders,
  storedInputs: object,
  newInputs: object
): object =>
  getOmittedSecretFields(type, storedInputs, newInputs).reduce<Record<string, unknown>>(
    (acc, field) => {
      const path = field.split(".");
      return setPath(acc, path, getPath(storedInputs, path));
    },
    newInputs as Record<string, unknown>
  );

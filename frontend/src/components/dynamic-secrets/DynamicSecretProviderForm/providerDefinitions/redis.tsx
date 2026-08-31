import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { buildStatementFields, SslRejectUnauthorizedField, StatementAccordion } from "../shared";
import { defineDynamicSecretProvider } from "../types";
import {
  getRedisCreateDefaultValues,
  getRedisCreatePayload,
  getRedisEditDefaultValues,
  getRedisEditPayload,
  redisCreateFormSchema,
  redisEditFormSchema
} from "./redisContract";

const redisConnectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "redis.example.com",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "default",
    layout: "half"
  },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    placeholder: "Enter Redis password",
    description: "Required if your Redis instance is password protected.",
    autoComplete: "new-password",
    isOptional: true,
    layout: "half"
  },
  {
    name: "inputs.ca",
    type: "secret",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true
  }
] as const;

const redisStatementFields = buildStatementFields();

const RedisFields = () => (
  <>
    <DynamicSecretProviderGroup id="redis-connection" presentation="panel">
      <DynamicSecretProviderFields fields={redisConnectionFields} />
      <SslRejectUnauthorizedField
        id="redis-ssl-reject-unauthorized"
        fallbackChecked={false}
        layout="labeled"
      />
    </DynamicSecretProviderGroup>
    <StatementAccordion title="Modify Redis Statements" fields={redisStatementFields} />
  </>
);

export const redisDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Redis,
  label: "Redis",
  customRenderer: {
    reasons: ["non-scalar-value"],
    Component: RedisFields
  },
  create: {
    schema: redisCreateFormSchema,
    getDefaultValues: getRedisCreateDefaultValues,
    toPayload: getRedisCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: redisEditFormSchema,
    getDefaultValues: getRedisEditDefaultValues,
    toPayload: getRedisEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

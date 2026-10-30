import {
  getRedisCreateDefaultValues,
  getRedisCreatePayload,
  getRedisEditDefaultValues,
  getRedisEditPayload,
  redisCreateFormSchema,
  redisEditFormSchema,
  type TRedisCreateFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/redisContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  buildStatementFields,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  StatementAccordion
} from "../fields";
import { defineFlowProvider } from "../types";

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
] satisfies readonly TDynamicSecretProviderField<TRedisCreateFormValues>[];

const redisStatementFields = buildStatementFields<TRedisCreateFormValues>();

function RedisFields() {
  return (
    <>
      <ProviderGroup id="redis-connection" presentation="panel">
        <ProviderFields fields={redisConnectionFields} />
        <SslRejectUnauthorizedField<TRedisCreateFormValues> fallbackChecked={false} />
      </ProviderGroup>
      <StatementAccordion title="Modify Redis Statements" fields={redisStatementFields} />
    </>
  );
}

export const redisFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Redis,
  label: "Redis",
  schema: redisCreateFormSchema,
  getDefaultValues: getRedisCreateDefaultValues,
  toPayload: getRedisCreatePayload,
  Renderer: RedisFields,
  submitLabel: "Submit",
  edit: {
    schema: redisEditFormSchema,
    getDefaultValues: getRedisEditDefaultValues,
    toPayload: getRedisEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

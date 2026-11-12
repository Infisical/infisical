import { useId } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  Toggle
} from "@app/components/v3";
import { AgentVaultServiceType } from "@app/hooks/api/agentVault";

import { SecretInput } from "./CredentialFields";
import { isPlainHttpUrl, TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";

const TOGGLE_DESCRIPTIONS: Record<AgentVaultServiceType, string> = {
  [AgentVaultServiceType.Http]: "Your server is asked before the proxy sends each request.",
  [AgentVaultServiceType.Mcp]:
    "Your server is asked before the proxy sends each request to the MCP server.",
  [AgentVaultServiceType.Postgres]:
    "Your server is asked once when the agent connects, not before each query.",
  [AgentVaultServiceType.Mysql]:
    "Your server is asked once when the agent connects, not before each query.",
  [AgentVaultServiceType.Ssh]:
    "Your server is asked once when the agent connects, not before each command."
};

export const HookFields = ({
  serviceType,
  hasStoredHook
}: {
  serviceType: AgentVaultServiceType;
  hasStoredHook: boolean;
}) => {
  const { control, clearErrors } = useFormContext<TServiceForm>();
  const baseId = useId();
  const hookEnabled = useWatch({ control, name: "hookEnabled" });
  const hookUrl = useWatch({ control, name: "hookUrl" });
  const hookSigningSecret = useWatch({ control, name: "hookSigningSecret" });
  const isReplacingSecret =
    hasStoredHook && hookSigningSecret !== UNCHANGED_SECRET && hookSigningSecret !== "";

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="hookEnabled"
        render={({ field }) => (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Use a Hook</FieldTitle>
              <FieldDescription>{TOGGLE_DESCRIPTIONS[serviceType]}</FieldDescription>
            </FieldContent>
            <Toggle
              id={`${baseId}-enabled`}
              aria-label="Use a Hook"
              variant="av"
              checked={field.value}
              onCheckedChange={(checked) => {
                if (!checked) clearErrors(["hookUrl", "hookSigningSecret"]);
                field.onChange(checked);
              }}
            />
          </Field>
        )}
      />

      {hookEnabled && (
        <Controller
          control={control}
          name="hookUrl"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={`${baseId}-url`}>Hook URL</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    if (fieldState.error) clearErrors("hookUrl");
                  }}
                  id={`${baseId}-url`}
                  placeholder="https://hooks.example.com/agent-vault"
                  autoComplete="off"
                  spellCheck={false}
                  isError={Boolean(fieldState.error)}
                />
                {isPlainHttpUrl(hookUrl) && (
                  <FieldDescription>
                    Requests and answers are sent unencrypted over http://.
                  </FieldDescription>
                )}
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {hookEnabled && (
        <Controller
          control={control}
          name="hookSigningSecret"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Signing Secret</FieldLabel>
              <FieldContent>
                <SecretInput
                  field={{
                    ...field,
                    onChange: (value: string) => {
                      field.onChange(value);
                      if (fieldState.error) clearErrors("hookSigningSecret");
                    }
                  }}
                  label="Signing Secret"
                  ariaLabel="Signing Secret"
                  placeholder="Enter the signing secret"
                  isError={Boolean(fieldState.error)}
                  isUntouched={hookSigningSecret === UNCHANGED_SECRET}
                  hasStoredSecret={hasStoredHook}
                  canBeCleared={false}
                  allowsVariables={false}
                />
                {isReplacingSecret && (
                  <FieldDescription>
                    Proxies switch to the new secret on their next check-in, every 60 seconds by
                    default.
                  </FieldDescription>
                )}
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}
    </div>
  );
};

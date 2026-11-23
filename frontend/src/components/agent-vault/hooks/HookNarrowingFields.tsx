import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  TagsInput
} from "@app/components/v3";
import { pathPrefixError } from "@app/helpers/agentVaultPathPrefix";
import { AgentVaultServiceType } from "@app/hooks/api/agentVault";

import {
  HTTP_METHODS,
  isAllMethods,
  toolNameError,
  TServiceForm
} from "../service-sheet/serviceSchema";

const NATIVE_TYPES = [
  AgentVaultServiceType.Postgres,
  AgentVaultServiceType.Mysql,
  AgentVaultServiceType.Ssh
];

type Props = {
  serviceType: AgentVaultServiceType | null;
  isDisabled?: boolean;
};

/**
 * What a hook checks of one service: methods and paths for an HTTP service, tools for an MCP service. A database or
 * SSH service is checked once per connection, so it has nothing to narrow.
 */
export const HookNarrowingFields = ({ serviceType, isDisabled = false }: Props) => {
  const baseId = useId();
  const { control, clearErrors, trigger } = useFormContext<TServiceForm>();

  if (serviceType === AgentVaultServiceType.Http) {
    return (
      <>
        <Controller
          control={control}
          name="hook.methods"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Methods</FieldLabel>
              <FieldContent>
                <Field orientation="horizontal">
                  <Checkbox
                    id={`${baseId}-all-methods`}
                    isChecked={isAllMethods(field.value)}
                    isDisabled={isDisabled}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true ? [...HTTP_METHODS] : [])
                    }
                  />
                  <FieldLabel htmlFor={`${baseId}-all-methods`}>All Methods</FieldLabel>
                </Field>
                <div
                  role="group"
                  aria-label="Methods"
                  className="mt-2 ml-6 grid w-fit grid-cols-4 gap-x-8 gap-y-2"
                >
                  {HTTP_METHODS.map((method) => (
                    <Field key={method} orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`${baseId}-method-${method}`}
                        isChecked={field.value.includes(method)}
                        isDisabled={isDisabled}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            HTTP_METHODS.filter((candidate) =>
                              candidate === method
                                ? checked === true
                                : field.value.includes(candidate)
                            )
                          )
                        }
                      />
                      <FieldLabel htmlFor={`${baseId}-method-${method}`}>{method}</FieldLabel>
                    </Field>
                  ))}
                </div>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="hook.paths"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Paths</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="hook.pathDraft"
                  render={({ field: draft }) => (
                    <TagsInput
                      value={field.value}
                      onValueChange={field.onChange}
                      inputValue={draft.value}
                      onInputValueChange={(next) => {
                        draft.onChange(next);
                        if (fieldState.error) clearErrors("hook.paths");
                      }}
                      validateTag={pathPrefixError}
                      onValidationError={(reason) =>
                        reason ? trigger("hook.paths") : clearErrors("hook.paths")
                      }
                      isDisabled={isDisabled}
                      isError={Boolean(fieldState.error)}
                      aria-label="Path prefixes"
                      placeholder="/repos"
                    />
                  )}
                />
                <FieldDescription>Path prefixes. Leave empty to match every path.</FieldDescription>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      </>
    );
  }

  if (serviceType === AgentVaultServiceType.Mcp) {
    return (
      <Controller
        control={control}
        name="hook.tools"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Tools</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="hook.toolDraft"
                render={({ field: draft }) => (
                  <TagsInput
                    value={field.value}
                    onValueChange={field.onChange}
                    inputValue={draft.value}
                    onInputValueChange={(next) => {
                      draft.onChange(next);
                      if (fieldState.error) clearErrors("hook.tools");
                    }}
                    validateTag={(tool, existing) =>
                      toolNameError(tool) ??
                      (existing.includes(tool) ? `"${tool}" is listed twice.` : null)
                    }
                    onValidationError={(reason) =>
                      reason ? trigger("hook.tools") : clearErrors("hook.tools")
                    }
                    isDisabled={isDisabled}
                    isError={Boolean(fieldState.error)}
                    aria-label="Tools"
                    placeholder="delete_issue"
                    className="font-mono"
                  />
                )}
              />
              <FieldDescription>
                Exact tool names. Leave empty to match every tool.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />
    );
  }

  if (serviceType && NATIVE_TYPES.includes(serviceType)) {
    return (
      <p className="text-xs text-accent">Every connection to this service goes to the hook.</p>
    );
  }
  return null;
};

import { useId } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Checkbox,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TagsInput
} from "@app/components/v3";
import { pathPrefixError } from "@app/helpers/agentVaultPathPrefix";
import { AgentVaultServiceType } from "@app/hooks/api/agentVault";
import { TAgentVaultProjectService } from "@app/hooks/api/agentVault/types";

import {
  HTTP_METHODS,
  hostPatternOf,
  isAllMethods,
  SERVICE_TYPE_LABELS,
  toolNameError
} from "../service-sheet/serviceSchema";
import { ServiceIcon } from "../ServiceIconStack";
import {
  blankHookRule,
  DELETED_SERVICE_LABEL,
  hookRuleServiceError,
  MAX_HOOK_RULES,
  THookForm
} from "./hookSchema";

type TServiceOption = {
  // Null for a typed name, such as an inline service's.
  id: string | null;
  name: string;
  type: AgentVaultServiceType | null;
  hostPattern: string | null;
};

const optionValue = (option: TServiceOption) => option.id ?? `name:${option.name}`;

const toOption = (service: TAgentVaultProjectService): TServiceOption => ({
  id: service.id,
  name: service.name,
  type: service.type,
  hostPattern: hostPatternOf(service)
});

const NATIVE_TYPES = [
  AgentVaultServiceType.Postgres,
  AgentVaultServiceType.Mysql,
  AgentVaultServiceType.Ssh
];

const RuleRow = ({
  index,
  services,
  isDisabled,
  onRemove
}: {
  index: number;
  services: TServiceOption[];
  isDisabled: boolean;
  onRemove: () => void;
}) => {
  const baseId = useId();
  const { control, setValue, clearErrors, trigger } = useFormContext<THookForm>();
  const serviceId = useWatch({ control, name: `rules.${index}.serviceId` });
  const service = useWatch({ control, name: `rules.${index}.service` });
  const serviceType = useWatch({ control, name: `rules.${index}.serviceType` });
  const known = serviceId
    ? services.find((option) => option.id === serviceId)
    : services.find((option) => option.name === service);
  let selected: TServiceOption | null = known ?? null;
  // The picker lists only the first page of services, so one missing from it still exists if the server sent its name.
  // A project service that is gone keeps its rule, so it can be moved to another service or removed.
  if (!selected && serviceId) {
    selected = { id: serviceId, name: service || DELETED_SERVICE_LABEL, type: serviceType, hostPattern: null };
  } else if (!selected && service) {
    selected = { id: null, name: service, type: serviceType, hostPattern: null };
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        <Controller
          control={control}
          name={`rules.${index}.service`}
          render={({ fieldState }) => (
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor={`${baseId}-service`}>Service</FieldLabel>
              <FieldContent>
                <Combobox<TServiceOption>
                  id={`${baseId}-service`}
                  options={services}
                  value={selected}
                  includeMissingSelectedOptions
                  getOptionValue={optionValue}
                  getOptionLabel={(option) => option.name}
                  renderOption={(option) => (
                    <span className="flex min-w-0 items-center gap-2">
                      <ServiceIcon hostPattern={option.hostPattern} serviceType={option.type} />
                      <span className="truncate">{option.name}</span>
                    </span>
                  )}
                  placeholder="Pick or type a service name"
                  searchAriaLabel="Search services"
                  emptyMessage="No service matches. Type its name to use it."
                  modal
                  isDisabled={isDisabled}
                  isError={Boolean(fieldState.error)}
                  creation={{
                    isValid: (inputValue) => !hookRuleServiceError(inputValue),
                    isDuplicate: (inputValue, option) =>
                      option.name === inputValue.trim().toLowerCase(),
                    formatLabel: (inputValue) => `Use "${inputValue.trim()}"`,
                    onCreate: (inputValue) => {
                      setValue(`rules.${index}.serviceId`, null, { shouldDirty: true });
                      setValue(`rules.${index}.service`, inputValue.trim().toLowerCase(), {
                        shouldDirty: true
                      });
                      setValue(`rules.${index}.serviceType`, null, { shouldDirty: true });
                      clearErrors(`rules.${index}`);
                    }
                  }}
                  onValueChange={(option) => {
                    setValue(`rules.${index}.serviceId`, option?.id ?? null, { shouldDirty: true });
                    setValue(`rules.${index}.service`, option?.name ?? "", { shouldDirty: true });
                    setValue(`rules.${index}.serviceType`, option?.type ?? null, {
                      shouldDirty: true
                    });
                    clearErrors(`rules.${index}`);
                  }}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
        {/* A project service's type is known; a typed name, such as an inline service's, needs one to be narrowed. */}
        {service && !serviceId && !known && (
          <Controller
            control={control}
            name={`rules.${index}.serviceType`}
            render={({ field }) => (
              <Field className="w-40 shrink-0">
                <FieldLabel>Type</FieldLabel>
                <FieldContent>
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(value) => {
                      field.onChange(value as AgentVaultServiceType);
                      clearErrors(`rules.${index}`);
                    }}
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.values(AgentVaultServiceType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {SERVICE_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />
        )}
        {!isDisabled && (
          <IconButton
            variant="ghost"
            className="mt-6 shrink-0"
            aria-label="Remove rule"
            onClick={onRemove}
          >
            <TrashIcon />
          </IconButton>
        )}
      </div>

      {serviceType === AgentVaultServiceType.Http && (
        <>
          <Controller
            control={control}
            name={`rules.${index}.methods`}
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
            name={`rules.${index}.paths`}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Paths</FieldLabel>
                <FieldContent>
                  <Controller
                    control={control}
                    name={`rules.${index}.pathDraft`}
                    render={({ field: draft }) => (
                      <TagsInput
                        value={field.value}
                        onValueChange={field.onChange}
                        inputValue={draft.value}
                        onInputValueChange={(next) => {
                          draft.onChange(next);
                          if (fieldState.error) clearErrors(`rules.${index}.paths`);
                        }}
                        validateTag={pathPrefixError}
                        onValidationError={(reason) =>
                          reason
                            ? trigger(`rules.${index}.paths`)
                            : clearErrors(`rules.${index}.paths`)
                        }
                        isDisabled={isDisabled}
                        isError={Boolean(fieldState.error)}
                        aria-label="Path prefixes"
                        placeholder="/repos"
                      />
                    )}
                  />
                  <FieldDescription>
                    Path prefixes. Leave empty to match every path.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </>
      )}

      {serviceType === AgentVaultServiceType.Mcp && (
        <Controller
          control={control}
          name={`rules.${index}.tools`}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel>Tools</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name={`rules.${index}.toolDraft`}
                  render={({ field: draft }) => (
                    <TagsInput
                      value={field.value}
                      onValueChange={field.onChange}
                      inputValue={draft.value}
                      onInputValueChange={(next) => {
                        draft.onChange(next);
                        if (fieldState.error) clearErrors(`rules.${index}.tools`);
                      }}
                      validateTag={(tool, existing) =>
                        toolNameError(tool) ??
                        (existing.includes(tool) ? `"${tool}" is listed twice.` : null)
                      }
                      onValidationError={(reason) =>
                        reason
                          ? trigger(`rules.${index}.tools`)
                          : clearErrors(`rules.${index}.tools`)
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
      )}

      {serviceType && NATIVE_TYPES.includes(serviceType) && (
        <p className="text-xs text-accent">Every connection to this service goes to the hook.</p>
      )}
    </div>
  );
};

export const HookRulesField = ({
  services,
  isDisabled = false
}: {
  services: TAgentVaultProjectService[];
  isDisabled?: boolean;
}) => {
  const { control, formState } = useFormContext<THookForm>();
  const rules = useFieldArray({ control, name: "rules" });
  const options = services.map(toOption);

  return (
    <Field>
      <FieldLabel>Rules</FieldLabel>
      <FieldContent>
        <FieldDescription>
          {rules.fields.length
            ? "Only requests that match a rule go to the hook."
            : "All traffic: every request of a session using this hook goes to it. Add a rule to send only some."}
        </FieldDescription>
        <div className="mt-2 flex flex-col gap-3">
          {rules.fields.map((rule, index) => (
            <RuleRow
              key={rule.id}
              index={index}
              services={options}
              isDisabled={isDisabled}
              onRemove={() => rules.remove(index)}
            />
          ))}
          <FieldError>
            {formState.errors.rules?.message ?? formState.errors.rules?.root?.message}
          </FieldError>
          {!isDisabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              isDisabled={rules.fields.length >= MAX_HOOK_RULES}
              onClick={() => rules.append(blankHookRule())}
            >
              <PlusIcon />
              Add Rule
            </Button>
          )}
        </div>
      </FieldContent>
    </Field>
  );
};

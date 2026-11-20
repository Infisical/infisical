import { useId, useState } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useDebounce } from "@app/hooks";
import { AgentVaultServiceType, useListAgentVaultServices } from "@app/hooks/api/agentVault";
import { TAgentVaultProjectService } from "@app/hooks/api/agentVault/types";

import { hostPatternOf } from "../service-sheet/serviceSchema";
import { ServiceIcon } from "../ServiceIconStack";
import { HookNarrowingFields } from "./HookNarrowingFields";
import { blankHookNarrowing, blankHookRule, MAX_HOOK_RULES, THookForm } from "./hookSchema";

export const SERVICE_PICKER_LIMIT = 100;

type TServiceOption = {
  name: string;
  type: AgentVaultServiceType | null;
  hostPattern: string | null;
};

const toOption = (service: TAgentVaultProjectService): TServiceOption => ({
  name: service.name,
  type: service.type,
  hostPattern: hostPatternOf(service)
});

const RuleRow = ({
  index,
  isDisabled,
  onRemove
}: {
  index: number;
  isDisabled: boolean;
  onRemove: () => void;
}) => {
  const baseId = useId();
  const { projectId } = useProject();
  const { control, getValues, setValue, clearErrors } = useFormContext<THookForm>();
  const service = useWatch({ control, name: `rules.${index}.service` });
  const serviceType = useWatch({ control, name: `rules.${index}.serviceType` });
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  // Searched on the server, since a project can have more services than one page.
  const { data: servicePage, isFetching } = useListAgentVaultServices(projectId, {
    search: debouncedSearch.trim() || undefined,
    orderBy: "name",
    orderDirection: "asc",
    limit: SERVICE_PICKER_LIMIT
  });
  const services = (servicePage?.services ?? []).map(toOption);
  // A saved rule's service can be missing from the page shown.
  const selected =
    services.find((option) => option.name === service) ??
    (service ? { name: service, type: serviceType, hostPattern: null } : null);

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
                  isClearable={false}
                  getOptionValue={(option) => option.name}
                  getOptionLabel={(option) => option.name}
                  renderOption={(option) => (
                    <span className="flex min-w-0 items-center gap-2">
                      <ServiceIcon hostPattern={option.hostPattern} serviceType={option.type} />
                      <span className="truncate">{option.name}</span>
                    </span>
                  )}
                  placeholder="Pick a service"
                  searchAriaLabel="Search services"
                  isLoading={isFetching}
                  onSearchChange={setSearch}
                  emptyMessage="No service matches."
                  modal
                  isDisabled={isDisabled}
                  isError={Boolean(fieldState.error)}
                  onValueChange={(option) => {
                    const current = getValues(`rules.${index}`);
                    // Another type narrows by other fields, which would only linger hidden.
                    const narrowing =
                      option.type === current.serviceType ? {} : blankHookNarrowing();
                    setValue(
                      `rules.${index}`,
                      { ...current, ...narrowing, service: option.name, serviceType: option.type },
                      { shouldDirty: true }
                    );
                    clearErrors(`rules.${index}`);
                  }}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
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
      <HookNarrowingFields
        prefix={`rules.${index}`}
        serviceType={serviceType}
        isDisabled={isDisabled}
      />
    </div>
  );
};

export const HookRulesField = ({
  isDisabled = false,
  isLeftWithoutServices = false
}: {
  isDisabled?: boolean;
  /** A saved hook whose services were all deleted or removed, which checks nothing rather than everything. */
  isLeftWithoutServices?: boolean;
}) => {
  const { control, formState } = useFormContext<THookForm>();
  const rules = useFieldArray({ control, name: "rules" });

  let description =
    "All traffic: every request of a session using this hook goes to it. Add a rule to send only some.";
  if (rules.fields.length) description = "Only requests that match a rule go to the hook.";
  else if (isLeftWithoutServices) {
    description =
      "No services: the services this hook checked were deleted or removed, so it checks nothing. Add a rule to check a service again.";
  }

  return (
    <Field>
      <FieldLabel>Rules</FieldLabel>
      <FieldContent>
        <FieldDescription>{description}</FieldDescription>
        <div className="mt-2 flex flex-col gap-3">
          {rules.fields.map((rule, index) => (
            <RuleRow
              key={rule.id}
              index={index}
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

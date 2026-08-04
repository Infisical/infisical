import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Badge,
  Button,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { TDbtProject, useDbtConnectionListProjects } from "@app/hooks/api/appConnections/dbt";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import {
  DBT_PERMISSION_SET_MAP,
  DbtPermissionsSet
} from "../schemas/dbt-service-token-rotation-schema";

export const DbtServiceTokenRotationParametersFields = () => {
  const { control, watch, setValue, getValues } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DbtServiceToken;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: projects, isPending: isProjectsPending } = useDbtConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const selectableProjects = useMemo(() => {
    if (!projects) return [];
    return [
      {
        id: undefined,
        name: "All projects"
      } as unknown as TDbtProject,
      ...projects
    ];
  }, [projects]);

  const permissionGrantsFields = useFieldArray({
    control,
    name: "parameters.permissionGrants"
  });

  useEffect(() => {
    if (permissionGrantsFields.fields.length === 0) {
      setValue("parameters.permissionGrants", [
        { permissionSet: DbtPermissionsSet.AccountAdmin, projectId: undefined }
      ]);
    }
  }, []);

  return (
    <>
      <Controller
        control={control}
        name="parameters.tokenName"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip tooltip="Enter a name for the service token to be created.">
              Service Token Name
            </FieldLabelWithTooltip>
            <Input {...field} placeholder="infisical-service-token" isError={Boolean(error)} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <FieldLabel>Permission Grants</FieldLabel>
      <div
        className={twMerge(
          "mb-3 flex w-full flex-col space-y-2",
          permissionGrantsFields?.fields?.length >= 5 ? "max-h-72 overflow-y-auto" : ""
        )}
      >
        {permissionGrantsFields.fields.map(({ id: roleFieldId }, i) => (
          <div key={roleFieldId} className="flex items-end space-x-2">
            <div className="w-80">
              {i === 0 && <span className="text-xs text-muted">Permission set</span>}
              <Controller
                control={control}
                name={`parameters.permissionGrants.${i}.permissionSet`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <Select
                      value={field.value}
                      onValueChange={(nextValue) => {
                        // Radix Select can emit a spurious empty onValueChange while options mount.
                        if (!nextValue || nextValue === field.value) return;
                        field.onChange(nextValue);
                      }}
                    >
                      <SelectTrigger className="w-80" isError={Boolean(error)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="max-h-72">
                        {Object.entries(DBT_PERMISSION_SET_MAP).map(
                          ([permissionSet, { label, isEnterpriseOnly }]) => (
                            <SelectItem key={permissionSet} value={permissionSet}>
                              <div className="flex items-center gap-2">
                                {label}
                                {isEnterpriseOnly && <Badge variant="info">DBT Enterprise</Badge>}
                              </div>
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </div>
            <div className="grow">
              {i === 0 && <FieldLabel className="text-xs text-muted">Projects</FieldLabel>}
              <Controller
                control={control}
                name={`parameters.permissionGrants.${i}.projectId`}
                render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
                  <Field className="w-full" data-invalid={Boolean(error)}>
                    <FilterableSelect
                      isLoading={isProjectsPending && Boolean(connectionId)}
                      isDisabled={!connectionId}
                      options={selectableProjects}
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) =>
                        typeof option.id === "undefined" ? option.id : option.id.toString()
                      }
                      value={selectableProjects?.find((p) => p.id === value) ?? undefined}
                      onBlur={onBlur}
                      onChange={(option) => {
                        const v = (option as SingleValue<TDbtProject>)?.id;
                        onChange(v ? Number(v) : undefined);
                      }}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </div>

            <IconButton
              type="button"
              aria-label="Delete grant"
              className="bottom-0.5 h-9"
              variant="outline"
              onClick={() => {
                const roles = getValues("parameters.permissionGrants");
                if (roles && roles?.length > 1) {
                  permissionGrantsFields.remove(i);
                } else {
                  setValue("parameters.permissionGrants", [
                    { permissionSet: DbtPermissionsSet.AccountAdmin, projectId: undefined }
                  ]);
                }
              }}
            >
              <TrashIcon />
            </IconButton>
          </div>
        ))}
        <div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() =>
              permissionGrantsFields.append({
                permissionSet: DbtPermissionsSet.AccountAdmin,
                projectId: undefined
              })
            }
          >
            <PlusIcon />
            Add grant
          </Button>
        </div>
      </div>
    </>
  );
};

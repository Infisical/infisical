import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Select,
  SelectItem
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
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

  const permissionGrants = watch("parameters.permissionGrants");

  console.log(permissionGrants);

  return (
    <>
      <FormLabel label="Permission Grants" />
      <div className="mb-3 flex w-full flex-col space-y-2">
        {permissionGrantsFields.fields.map(({ id: roleFieldId }, i) => (
          <div key={roleFieldId} className="flex items-end space-x-2">
            <div className="w-72">
              {i === 0 && <span className="text-xs text-mineshaft-400">Permission set</span>}
              <Controller
                control={control}
                name={`parameters.permissionGrants.${i}.permissionSet`}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <Select className="w-72" value={field.value} onValueChange={field.onChange}>
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
                    </Select>
                  </FormControl>
                )}
              />
            </div>
            <div className="grow">
              {i === 0 && <FormLabel label="Projects" className="text-xs text-mineshaft-400" />}
              <Controller
                control={control}
                name={`parameters.permissionGrants.${i}.projectId`}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0 w-full"
                  >
                    <FilterableSelect
                      isLoading={isProjectsPending && Boolean(connectionId)}
                      isDisabled={!connectionId}
                      options={selectableProjects}
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) =>
                        typeof option.id === "undefined" ? option.id : option.id.toString()
                      }
                      value={selectableProjects?.find((p) => p.id === value) ?? undefined}
                      onChange={(option) => {
                        const v = (option as SingleValue<TDbtProject>)?.id;
                        onChange(v ? Number(v) : undefined);
                      }}
                    />
                  </FormControl>
                )}
              />
            </div>
            <IconButton
              ariaLabel="delete key"
              className="bottom-0.5 h-9"
              variant="outline_bg"
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
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            size="xs"
            variant="outline_bg"
            onClick={() =>
              permissionGrantsFields.append({
                permissionSet: DbtPermissionsSet.AccountAdmin,
                projectId: undefined
              })
            }
          >
            Add grant
          </Button>
        </div>
      </div>
    </>
  );
};

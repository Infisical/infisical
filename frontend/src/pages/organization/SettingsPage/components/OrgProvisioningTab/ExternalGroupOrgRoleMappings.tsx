import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { isCustomOrgRole } from "@app/helpers/roles";
import { useGetOrgRoles } from "@app/hooks/api";
import {
  useGetExternalGroupOrgRoleMappings,
  useUpdateExternalGroupOrgRoleMappings
} from "@app/hooks/api/externalGroupOrgRoleMappings";

const formSchema = z.object({
  mappings: z
    .object({
      groupName: z.string().trim().min(1, { message: "Group name is required" }),
      roleSlug: z.string()
    })
    .array()
});

type TForm = z.infer<typeof formSchema>;

export const ExternalGroupOrgRoleMappings = () => {
  const { currentOrg } = useOrganization();
  const { data: roles, isPending: isRolesLoading } = useGetOrgRoles(currentOrg.id);
  const { data: mappings } = useGetExternalGroupOrgRoleMappings();
  const updateMappings = useUpdateExternalGroupOrgRoleMappings();
  const { permission } = useOrgPermission();

  const {
    control,
    formState: { isDirty },
    handleSubmit,
    reset
  } = useForm<TForm>({
    defaultValues: { mappings: [] },
    resolver: zodResolver(formSchema)
  });

  useEffect(() => {
    if (!mappings || !roles) return;

    reset({
      mappings: mappings.map((mapping) => ({
        groupName: mapping.groupName,
        roleSlug:
          mapping.role === "custom"
            ? roles.find((role) => mapping.roleId === role.id)!.slug
            : mapping.role
      }))
    });
  }, [mappings, roles]);

  const mappingField = useFieldArray({ control, name: "mappings" });

  const handleUpdateMappings = async (form: TForm) => {
    await updateMappings.mutateAsync(form);
    createNotification({
      text: "Group organization role mappings updated.",
      type: "success"
    });
  };

  const disableScimEdit = permission.cannot(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);

  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">
        SCIM Group to Organization Role Mappings
      </h3>
      <p className="text-xs text-muted">
        Assign newly provisioned users a default organization role based on their SCIM group.
      </p>
      <form onSubmit={handleSubmit(handleUpdateMappings)} className="pt-4">
        {isRolesLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={`mapping-skeleton-${idx}`} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mappingField.fields.map(({ id: scopeFieldId }, i) => (
              <div key={scopeFieldId} className="flex items-start gap-2">
                <Controller
                  control={control}
                  name={`mappings.${i}.groupName`}
                  render={({ field, fieldState: { error } }) => (
                    <Field className="flex-1">
                      {i === 0 && (
                        <FieldLabel
                          htmlFor={`mappings.${i}.groupName`}
                          className="flex items-center gap-1.5"
                        >
                          SCIM Group Name
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Info className="size-3 text-muted" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md whitespace-pre-line">
                              The name associated with this group in your SCIM provider
                            </TooltipContent>
                          </Tooltip>
                        </FieldLabel>
                      )}
                      <Input
                        id={`mappings.${i}.groupName`}
                        isError={Boolean(error?.message)}
                        disabled={disableScimEdit}
                        placeholder="SCIM group identifier..."
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`mappings.${i}.roleSlug`}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field className="flex-1">
                      {i === 0 && (
                        <FieldLabel htmlFor={`mappings.${i}.roleSlug`}>
                          Role to Assign Users in this Group
                        </FieldLabel>
                      )}
                      <Select value={value} onValueChange={onChange} disabled={disableScimEdit}>
                        <SelectTrigger
                          id={`mappings.${i}.roleSlug`}
                          isError={Boolean(error?.message)}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles?.map((role) => (
                            <SelectItem value={role.slug} key={`role-${role.id}`}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <IconButton
                  variant="outline"
                  className={i === 0 ? "mt-6" : ""}
                  aria-label="Delete mapping"
                  isDisabled={disableScimEdit}
                  onClick={() => {
                    mappingField.remove(i);
                  }}
                >
                  <Trash2 />
                </IconButton>
              </div>
            ))}
            <div>
              <Button
                size="xs"
                variant="outline"
                isDisabled={disableScimEdit}
                onClick={() =>
                  mappingField.append({
                    groupName: "",
                    roleSlug: isCustomOrgRole(currentOrg!.defaultMembershipRole)
                      ? roles?.find((role) => currentOrg?.defaultMembershipRole === role.id)
                          ?.slug || ""
                      : currentOrg!.defaultMembershipRole
                  })
                }
              >
                <Plus />
                Add Mapping
              </Button>
            </div>
            {isDirty && (
              <div className="flex w-full justify-end">
                <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Scim}>
                  {(isAllowed) => (
                    <Button
                      isDisabled={!isAllowed}
                      variant="org"
                      type="submit"
                      isPending={updateMappings.isPending}
                    >
                      Update Mappings
                    </Button>
                  )}
                </OrgPermissionCan>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
};

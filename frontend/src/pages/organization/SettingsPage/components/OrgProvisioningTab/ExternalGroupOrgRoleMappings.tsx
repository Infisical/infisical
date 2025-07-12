import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Select,
  SelectItem,
  Spinner
} from "@app/components/v2";
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
    try {
      await updateMappings.mutateAsync(form);
      createNotification({
        text: "Group organization role mappings updated.",
        type: "success"
      });
    } catch (e) {
      console.error(e);
      createNotification({
        text: "Failed to update group organization role mappings.",
        type: "error"
      });
    }
  };

  const disableScimEdit = permission.cannot(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);

  return (
    <div className="py-4">
      <h2 className="text-md text-mineshaft-100">SCIM Group to Organization Role Mappings</h2>
      <p className="text-sm text-mineshaft-300">
        Assign newly provisioned users a default organization role based on their SCIM group.
      </p>
      <form onSubmit={handleSubmit(handleUpdateMappings)} className="pt-4">
        {isRolesLoading || isRolesLoading ? (
          <Spinner className="self-center" size="sm" />
        ) : (
          <div className="mb-2 flex flex-col space-y-2">
            {mappingField.fields.map(({ id: scopeFieldId }, i) => (
              <div key={scopeFieldId} className="flex items-end space-x-2">
                <div className="flex-grow">
                  {i === 0 && (
                    <FormLabel
                      label="SCIM Group Name"
                      className="text-xs text-mineshaft-400"
                      tooltipClassName="max-w-md whitespace-pre-line"
                      tooltipText="The name associated with this group in your SCIM provider"
                    />
                  )}
                  <Controller
                    control={control}
                    name={`mappings.${i}.groupName`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0 flex-grow"
                      >
                        <Input
                          isDisabled={disableScimEdit}
                          {...field}
                          placeholder="SCIM group identifier..."
                        />
                      </FormControl>
                    )}
                  />
                </div>
                <div className="flex-1">
                  {i === 0 && (
                    <span className="text-xs text-mineshaft-400">
                      Role to Assign Users in this Group
                    </span>
                  )}
                  <Controller
                    control={control}
                    name={`mappings.${i}.roleSlug`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0 flex-grow"
                      >
                        <Select
                          isDisabled={disableScimEdit}
                          {...field}
                          onValueChange={(e) => field.onChange(e)}
                          className="w-full"
                        >
                          {roles?.map((role) => (
                            <SelectItem value={role.slug} key={`role-${role.id}`}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </div>
                <IconButton
                  ariaLabel="delete key"
                  className="bottom-0.5 h-9"
                  variant="outline_bg"
                  isDisabled={disableScimEdit}
                  onClick={() => {
                    mappingField.remove(i);
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
                Add Mapping
              </Button>
            </div>
            {isDirty && (
              <div className="flex w-full justify-end">
                <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Scim}>
                  {(isAllowed) => (
                    <Button isDisabled={!isAllowed} colorSchema="secondary" type="submit">
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

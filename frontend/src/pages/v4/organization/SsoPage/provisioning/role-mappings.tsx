import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@infisical/cipher/ui/button";
import { FieldError } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { z } from "zod";

import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isCustomOrgRole } from "@app/helpers/roles";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";

import styles from "./provisioning.module.css";

const formSchema = z.object({
  mappings: z
    .object({
      groupName: z.string().trim().min(1, { message: "Group name is required" }),
      roleSlug: z.string()
    })
    .array()
});

type TForm = z.infer<typeof formSchema>;

export const ScimGroupRoleMappings = () => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const org = useV4Adapter("org");
  const { permission } = useOrgPermission();
  const { data: organization } = org.useOrganization(orgId);
  const { data: roles, isPending: isRolesLoading } = org.useRoles(orgId);
  const { data: mappings } = sso.useExternalGroupRoleMappings();
  const updateMappings = sso.useUpdateExternalGroupRoleMappings();
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);

  const {
    control,
    register,
    formState: { isDirty, errors },
    handleSubmit,
    reset,
    setValue,
    watch
  } = useForm<TForm>({
    defaultValues: { mappings: [] },
    resolver: zodResolver(formSchema)
  });
  const mappingField = useFieldArray({ control, name: "mappings" });
  const values = watch("mappings");

  useEffect(() => {
    if (!mappings || !roles) return;
    reset({
      mappings: mappings.map((mapping) => ({
        groupName: mapping.groupName,
        roleSlug:
          mapping.role === "custom"
            ? (roles.find((role) => mapping.roleId === role.id)?.slug ?? "")
            : mapping.role
      }))
    });
  }, [mappings, roles]);

  const defaultRoleSlug = () => {
    const defaultRole = organization?.defaultMembershipRole ?? "";
    return isCustomOrgRole(defaultRole)
      ? roles?.find((role) => role.id === defaultRole)?.slug || ""
      : defaultRole;
  };

  const save = () =>
    new Promise<void>((resolve, reject) => {
      handleSubmit(
        async (form) => {
          try {
            await updateMappings.mutateAsync(form);
            reset(form);
            saved("Group organization role mappings updated");
            resolve();
          } catch (error) {
            reject(
              new Error(
                error instanceof Error
                  ? `The mappings were not saved: ${error.message}`
                  : "The mappings were not saved. Try again."
              )
            );
          }
        },
        () => reject(new Error("Enter a group name for every mapping, then save again."))
      )();
    });

  return (
    <SettingsCard
      title="SCIM group to organization role mappings"
      description="Assign newly provisioned users a default organization role based on their SCIM group."
      loading={isRolesLoading}
      dirty={isDirty}
      saveLabel="Update mappings"
      locked={canEdit ? undefined : "You need permission to edit SCIM to change these mappings."}
      onDiscard={() => reset()}
      onSave={save}
    >
      <Stack gap={12}>
        {mappingField.fields.length > 0 && (
          <div className={styles.mappings}>
            <span className={styles.mappingHeader}>
              SCIM group name
              <Tooltip content="The name associated with this group in your SCIM provider">
                <span className={styles.infoMark}>
                  <Icon name="info" size={12} />
                </span>
              </Tooltip>
            </span>
            <span className={styles.mappingHeader}>Role to assign users in this group</span>
            <span />
            {mappingField.fields.map(({ id }, index) => {
              const error = errors.mappings?.[index]?.groupName?.message;
              return (
                <div key={id} className={styles.mappingRow}>
                  <div className={styles.mappingCell}>
                    <Input
                      aria-label={`SCIM group name, mapping ${index + 1}`}
                      placeholder="SCIM group identifier..."
                      invalid={Boolean(error)}
                      {...register(`mappings.${index}.groupName`)}
                    />
                    <FieldError>{error}</FieldError>
                  </div>
                  <Select
                    aria-label={`Role for mapping ${index + 1}`}
                    placeholder="Select role"
                    options={(roles ?? []).map((role) => ({ value: role.slug, label: role.name }))}
                    value={values[index]?.roleSlug ?? ""}
                    onChange={(roleSlug: string) =>
                      setValue(`mappings.${index}.roleSlug`, roleSlug, { shouldDirty: true })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    icon="trash"
                    iconOnly
                    onClick={() => mappingField.remove(index)}
                  >
                    {`Delete mapping ${index + 1}`}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            icon="plus"
            onClick={() => mappingField.append({ groupName: "", roleSlug: defaultRoleSlug() })}
          >
            Add mapping
          </Button>
        </div>
      </Stack>
    </SettingsCard>
  );
};

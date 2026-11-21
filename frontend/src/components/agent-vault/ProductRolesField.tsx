import { useMemo } from "react";

import { RoleOptionContent } from "@app/components/roles";
import { Combobox, FieldDescription } from "@app/components/v3";
import {
  AGENT_VAULT_MAX_MEMBER_ROLES,
  assignableAgentVaultRoles,
  canAddAgentVaultRole,
  nextAgentVaultRoles
} from "@app/helpers/agentVaultMembers";
import { TAgentVaultRoleOption, useAgentVaultRoleOptions } from "@app/hooks/api/agentVaultRoles";

import { useAgentVaultAdminGuard } from "./useAgentVaultAdminGuard";

type Props = {
  projectId: string;
  value: string[];
  onChange: (roles: string[]) => void;
  id?: string;
  isError?: boolean;
};

// Without Read on roles a custom role can't be looked up, so it shows by its slug.
const unknownRole = (slug: string): TAgentVaultRoleOption => ({
  slug,
  name: slug,
  description: "",
  isCustom: true
});

export const ProductRolesField = ({ projectId, value, onChange, id, isError }: Props) => {
  const { builtIn, custom, isPending, findRole } = useAgentVaultRoleOptions(projectId);
  const { isViewerAdmin } = useAgentVaultAdminGuard();
  // A selected Admin still renders by name: findRole covers every built-in, and the combobox keeps selected values it
  // doesn't offer.
  const options = useMemo(
    () => assignableAgentVaultRoles([...builtIn, ...custom], isViewerAdmin),
    [builtIn, custom, isViewerAdmin]
  );
  const selected = useMemo(
    () => value.map((slug) => findRole(slug) ?? unknownRole(slug)),
    [value, findRole]
  );

  return (
    <>
      <Combobox
        id={id}
        multiple
        isClearable={false}
        includeMissingSelectedOptions
        options={options}
        value={selected}
        isLoading={isPending}
        isError={isError}
        onValueChange={(next) =>
          onChange(
            nextAgentVaultRoles(
              value,
              next.map((role) => role.slug)
            )
          )
        }
        getOptionValue={(role) => role.slug}
        getOptionLabel={(role) => role.name}
        getOptionKeywords={(role) => [role.slug, role.description]}
        getOptionGroup={(role) => (role.isCustom ? "Custom" : "Built-In")}
        isOptionDisabled={(role) => !canAddAgentVaultRole(value, role.slug)}
        renderOption={(role) => <RoleOptionContent role={role} />}
        placeholder="Pick roles"
        searchAriaLabel="Search roles"
        emptyMessage="No roles match your search"
      />
      <FieldDescription>
        Roles add up, to at most {AGENT_VAULT_MAX_MEMBER_ROLES}. No Access can&apos;t be combined
        with other roles.
      </FieldDescription>
    </>
  );
};

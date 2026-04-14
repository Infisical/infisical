import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { FilterableSelect } from "@app/components/v3";
import { OrgPermissionIdentityActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";
import {
  MultiValueRemove,
  MultiValueWithTooltip,
  OptionWithDescription
} from "./OrgPermissionRowComponents";

const PERMISSION_ACTIONS = [
  {
    action: OrgPermissionIdentityActions.Read,
    label: "Read Identities",
    description: "View machine identities and their configuration"
  },
  {
    action: OrgPermissionIdentityActions.Create,
    label: "Create Identities",
    description: "Create new machine identities"
  },
  {
    action: OrgPermissionIdentityActions.Edit,
    label: "Edit Identities",
    description: "Update machine identity settings"
  },
  {
    action: OrgPermissionIdentityActions.Delete,
    label: "Delete Identities",
    description: "Delete machine identities"
  },
  {
    action: OrgPermissionIdentityActions.GrantPrivileges,
    label: "Grant Privileges",
    description: undefined
  },
  {
    action: OrgPermissionIdentityActions.RevokeAuth,
    label: "Revoke Auth",
    description: "Revoke authentication for a machine identity"
  },
  {
    action: OrgPermissionIdentityActions.CreateToken,
    label: "Create Token",
    description: "Generate access tokens for machine identities"
  },
  {
    action: OrgPermissionIdentityActions.GetToken,
    label: "Get Token",
    description: "View existing access tokens"
  },
  {
    action: OrgPermissionIdentityActions.DeleteToken,
    label: "Delete Token",
    description: "Revoke access tokens"
  }
] as const;

type Props = {
  isEditable: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-access",
  Custom = "custom"
}

const actionOptions = PERMISSION_ACTIONS.map(({ action, label, description }) => ({
  value: action as string,
  label,
  description
}));

export const OrgPermissionIdentityRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.identity"
  });

  const selectedActions = useMemo(
    () => actionOptions.filter((opt) => Boolean(rule?.[opt.value as keyof typeof rule])),
    [rule]
  );

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSION_ACTIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (isCustom) return Permission.Custom;
    if (score === 1 && rule?.read) return Permission.ReadOnly;

    return Permission.Custom;
  }, [rule, isCustom]);

  useEffect(() => {
    if (selectedPermissionCategory === Permission.Custom) setIsCustom.on();
    else setIsCustom.off();
  }, [selectedPermissionCategory]);

  useEffect(() => {
    const isRowCustom = selectedPermissionCategory === Permission.Custom;
    if (isRowCustom) {
      setIsRowExpanded.on();
    }
  }, []);

  const handlePermissionChange = (val: Permission) => {
    if (val === Permission.Custom) {
      setIsRowExpanded.on();
      setIsCustom.on();
      return;
    }
    setIsCustom.off();

    switch (val) {
      case Permission.NoAccess:
        setValue(
          "permissions.identity",
          {
            [OrgPermissionIdentityActions.Read]: false,
            [OrgPermissionIdentityActions.Edit]: false,
            [OrgPermissionIdentityActions.Create]: false,
            [OrgPermissionIdentityActions.Delete]: false,
            [OrgPermissionIdentityActions.GrantPrivileges]: false,
            [OrgPermissionIdentityActions.RevokeAuth]: false,
            [OrgPermissionIdentityActions.CreateToken]: false,
            [OrgPermissionIdentityActions.GetToken]: false,
            [OrgPermissionIdentityActions.DeleteToken]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.identity",
          {
            [OrgPermissionIdentityActions.Read]: true,
            [OrgPermissionIdentityActions.Edit]: true,
            [OrgPermissionIdentityActions.Create]: true,
            [OrgPermissionIdentityActions.Delete]: true,
            [OrgPermissionIdentityActions.GrantPrivileges]: true,
            [OrgPermissionIdentityActions.RevokeAuth]: true,
            [OrgPermissionIdentityActions.CreateToken]: true,
            [OrgPermissionIdentityActions.GetToken]: true,
            [OrgPermissionIdentityActions.DeleteToken]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.identity",
          {
            [OrgPermissionIdentityActions.Read]: true,
            [OrgPermissionIdentityActions.Edit]: false,
            [OrgPermissionIdentityActions.Create]: false,
            [OrgPermissionIdentityActions.Delete]: false,
            [OrgPermissionIdentityActions.GrantPrivileges]: false,
            [OrgPermissionIdentityActions.RevokeAuth]: false,
            [OrgPermissionIdentityActions.CreateToken]: false,
            [OrgPermissionIdentityActions.GetToken]: false,
            [OrgPermissionIdentityActions.DeleteToken]: false
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.identity",
          {
            [OrgPermissionIdentityActions.Read]: false,
            [OrgPermissionIdentityActions.Edit]: false,
            [OrgPermissionIdentityActions.Create]: false,
            [OrgPermissionIdentityActions.Delete]: false,
            [OrgPermissionIdentityActions.GrantPrivileges]: false,
            [OrgPermissionIdentityActions.RevokeAuth]: false,
            [OrgPermissionIdentityActions.CreateToken]: false,
            [OrgPermissionIdentityActions.GetToken]: false,
            [OrgPermissionIdentityActions.DeleteToken]: false
          },
          { shouldDirty: true }
        );
        break;
    }
  };

  const handleActionsChange = (newValue: unknown) => {
    const selected = Array.isArray(newValue) ? newValue : [];
    const updated = Object.fromEntries(
      PERMISSION_ACTIONS.map(({ action }) => [
        action,
        selected.some((s: { value: string }) => s.value === action)
      ])
    );
    setValue("permissions.identity", updated as any, { shouldDirty: true });
  };

  return (
    <>
      <Tr
        className="min-h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td className="w-4">
          <FontAwesomeIcon className="w-4" icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td className="w-full select-none">
          <p>Machine Identity Management</p>
          <p className="text-xs text-mineshaft-400">
            Manage machine identities and their access within the organization
          </p>
        </Td>
        <Td>
          <Select
            value={selectedPermissionCategory}
            className="h-8 w-40 bg-mineshaft-700"
            dropdownContainerClassName="border text-left border-mineshaft-600 bg-mineshaft-800"
            onValueChange={handlePermissionChange}
            isDisabled={!isEditable}
            position="popper"
          >
            <SelectItem value={Permission.NoAccess}>No Access</SelectItem>
            <SelectItem value={Permission.ReadOnly}>Read Only</SelectItem>
            <SelectItem value={Permission.FullAccess}>Full Access</SelectItem>
            <SelectItem value={Permission.Custom}>
              {selectedPermissionCategory === Permission.Custom
                ? `Custom (${selectedCount})`
                : "Custom"}
            </SelectItem>
          </Select>
        </Td>
      </Tr>
      {isRowExpanded && (
        <Tr>
          <Td colSpan={3} className="bg-mineshaft-800 px-6 py-4">
            <FilterableSelect
              isMulti
              value={selectedActions}
              onChange={handleActionsChange}
              options={actionOptions}
              placeholder={isEditable ? "Select actions..." : "No actions allowed"}
              isDisabled={!isEditable}
              isClearable={isEditable}
              className="w-full"
              menuPosition="fixed"
              components={{
                Option: OptionWithDescription,
                MultiValueRemove,
                MultiValue: MultiValueWithTooltip
              }}
            />
          </Td>
        </Tr>
      )}
    </>
  );
};

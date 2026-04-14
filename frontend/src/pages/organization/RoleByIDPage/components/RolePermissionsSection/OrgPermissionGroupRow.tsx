import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { FilterableSelect } from "@app/components/v3";
import { OrgPermissionGroupActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";
import {
  MultiValueRemove,
  MultiValueWithTooltip,
  OptionWithDescription
} from "./OrgPermissionRowComponents";

const PERMISSION_ACTIONS = [
  {
    action: OrgPermissionGroupActions.Read,
    label: "Read Groups",
    description: "View groups and their members"
  },
  {
    action: OrgPermissionGroupActions.Create,
    label: "Create Groups",
    description: "Create new user groups"
  },
  {
    action: OrgPermissionGroupActions.Edit,
    label: "Edit Groups",
    description: "Update group membership and settings"
  },
  {
    action: OrgPermissionGroupActions.Delete,
    label: "Delete Groups",
    description: "Delete groups"
  },
  {
    action: OrgPermissionGroupActions.GrantPrivileges,
    label: "Grant Privileges",
    description: undefined
  },
  {
    action: OrgPermissionGroupActions.AddMembers,
    label: "Add Members",
    description: "Add users to a group"
  },
  {
    action: OrgPermissionGroupActions.RemoveMembers,
    label: "Remove Members",
    description: "Remove users from a group"
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

export const OrgPermissionGroupRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.groups"
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
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: false,
            [OrgPermissionGroupActions.Create]: false,
            [OrgPermissionGroupActions.Edit]: false,
            [OrgPermissionGroupActions.Delete]: false,
            [OrgPermissionGroupActions.GrantPrivileges]: false,
            [OrgPermissionGroupActions.AddMembers]: false,
            [OrgPermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: true,
            [OrgPermissionGroupActions.Create]: true,
            [OrgPermissionGroupActions.Edit]: true,
            [OrgPermissionGroupActions.Delete]: true,
            [OrgPermissionGroupActions.GrantPrivileges]: true,
            [OrgPermissionGroupActions.AddMembers]: true,
            [OrgPermissionGroupActions.RemoveMembers]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: true,
            [OrgPermissionGroupActions.Edit]: false,
            [OrgPermissionGroupActions.Create]: false,
            [OrgPermissionGroupActions.Delete]: false,
            [OrgPermissionGroupActions.GrantPrivileges]: false,
            [OrgPermissionGroupActions.AddMembers]: false,
            [OrgPermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: false,
            [OrgPermissionGroupActions.Edit]: false,
            [OrgPermissionGroupActions.Create]: false,
            [OrgPermissionGroupActions.Delete]: false,
            [OrgPermissionGroupActions.GrantPrivileges]: false,
            [OrgPermissionGroupActions.AddMembers]: false,
            [OrgPermissionGroupActions.RemoveMembers]: false
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
    setValue("permissions.groups", updated as any, { shouldDirty: true });
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
          <p>Group Management</p>
          <p className="text-xs text-mineshaft-400">
            Organize users into groups for bulk permission management
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

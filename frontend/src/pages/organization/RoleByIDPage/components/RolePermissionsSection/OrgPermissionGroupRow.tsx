import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { FilterableSelect } from "@app/components/v3";
import { useToggle } from "@app/hooks";
import { OrgPermissionGroupActions } from "@app/context/OrgPermissionContext/types";

import { ORG_PERMISSION_OBJECT, TFormSchema } from "../OrgRoleModifySection.utils";
import {
  MultiValueRemove,
  MultiValueWithTooltip,
  OptionWithDescription,
  useOrgPermissionActions
} from "./OrgPermissionRowComponents";

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

export const OrgPermissionGroupRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const { rule, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: "permissions.groups",
    permissionActions: ORG_PERMISSION_OBJECT.groups.actions
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = ORG_PERMISSION_OBJECT.groups.actions.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (isCustom) return Permission.Custom;
    if (score === 1 && rule?.[OrgPermissionGroupActions.Read]) return Permission.ReadOnly;

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
          <p>{ORG_PERMISSION_OBJECT.groups.title}</p>
          <p className="text-xs text-mineshaft-400">
            {ORG_PERMISSION_OBJECT.groups.description}
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
              options={ORG_PERMISSION_OBJECT.groups.actions}
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

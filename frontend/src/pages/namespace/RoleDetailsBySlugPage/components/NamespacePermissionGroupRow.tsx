import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, Select, SelectItem, Td, Tr } from "@app/components/v2";
import { NamespacePermissionGroupActions } from "@app/context/NamespacePermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "./NamespaceRoleModifySection.utils";

const PERMISSION_ACTIONS = [
  { action: NamespacePermissionGroupActions.Read, label: "Read Groups" },
  { action: NamespacePermissionGroupActions.Create, label: "Create Groups" },
  { action: NamespacePermissionGroupActions.Edit, label: "Edit Groups" },
  { action: NamespacePermissionGroupActions.Delete, label: "Delete Groups" },
  { action: NamespacePermissionGroupActions.GrantPrivileges, label: "Grant Privileges" },
  { action: NamespacePermissionGroupActions.AddMembers, label: "Add Members" },
  { action: NamespacePermissionGroupActions.RemoveMembers, label: "Remove Members" }
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

export const NamespacePermissionGroupRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.groups"
  });

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSION_ACTIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (isCustom) return Permission.Custom;
    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
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
            [NamespacePermissionGroupActions.Read]: false,
            [NamespacePermissionGroupActions.Create]: false,
            [NamespacePermissionGroupActions.Edit]: false,
            [NamespacePermissionGroupActions.Delete]: false,
            [NamespacePermissionGroupActions.GrantPrivileges]: false,
            [NamespacePermissionGroupActions.AddMembers]: false,
            [NamespacePermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.groups",
          {
            [NamespacePermissionGroupActions.Read]: true,
            [NamespacePermissionGroupActions.Create]: true,
            [NamespacePermissionGroupActions.Edit]: true,
            [NamespacePermissionGroupActions.Delete]: true,
            [NamespacePermissionGroupActions.GrantPrivileges]: true,
            [NamespacePermissionGroupActions.AddMembers]: true,
            [NamespacePermissionGroupActions.RemoveMembers]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.groups",
          {
            [NamespacePermissionGroupActions.Read]: true,
            [NamespacePermissionGroupActions.Edit]: false,
            [NamespacePermissionGroupActions.Create]: false,
            [NamespacePermissionGroupActions.Delete]: false,
            [NamespacePermissionGroupActions.GrantPrivileges]: false,
            [NamespacePermissionGroupActions.AddMembers]: false,
            [NamespacePermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.groups",
          {
            [NamespacePermissionGroupActions.Read]: false,
            [NamespacePermissionGroupActions.Edit]: false,
            [NamespacePermissionGroupActions.Create]: false,
            [NamespacePermissionGroupActions.Delete]: false,
            [NamespacePermissionGroupActions.GrantPrivileges]: false,
            [NamespacePermissionGroupActions.AddMembers]: false,
            [NamespacePermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <>
      <Tr
        className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td className="w-4">
          <FontAwesomeIcon className="w-4" icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td className="w-full select-none">Group Management</Td>
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
            <SelectItem value={Permission.Custom}>Custom</SelectItem>
          </Select>
        </Td>
      </Tr>
      {isRowExpanded && (
        <Tr>
          <Td colSpan={3} className="border-mineshaft-500 bg-mineshaft-900 p-8">
            <div className="flex flex-grow flex-wrap justify-start gap-x-8 gap-y-4">
              {PERMISSION_ACTIONS.map(({ action, label }) => {
                return (
                  <Controller
                    name={`permissions.groups.${action}`}
                    key={`permissions.groups.${action}`}
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        isChecked={field.value}
                        onCheckedChange={(e) => {
                          if (!isEditable) {
                            createNotification({
                              type: "error",
                              text: "Failed to update default role"
                            });
                            return;
                          }
                          field.onChange(e);
                        }}
                        id={`permissions.groups.${action}`}
                      >
                        {label}
                      </Checkbox>
                    )}
                  />
                );
              })}
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};

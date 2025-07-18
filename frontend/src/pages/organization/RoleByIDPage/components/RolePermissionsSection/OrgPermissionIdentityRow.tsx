import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, Select, SelectItem, Td, Tr } from "@app/components/v2";
import { OrgPermissionIdentityActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";

const PERMISSION_ACTIONS = [
  { action: OrgPermissionIdentityActions.Read, label: "Read Identities" },
  { action: OrgPermissionIdentityActions.Create, label: "Create Identities" },
  { action: OrgPermissionIdentityActions.Edit, label: "Edit Identities" },
  { action: OrgPermissionIdentityActions.Delete, label: "Delete Identities" },
  { action: OrgPermissionIdentityActions.GrantPrivileges, label: "Grant Privileges" },
  { action: OrgPermissionIdentityActions.RevokeAuth, label: "Revoke Auth" },
  { action: OrgPermissionIdentityActions.CreateToken, label: "Create Token" },
  { action: OrgPermissionIdentityActions.GetToken, label: "Get Token" },
  { action: OrgPermissionIdentityActions.DeleteToken, label: "Delete Token" }
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

export const OrgPermissionIdentityRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.identity"
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

  return (
    <>
      <Tr
        className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td className="w-4">
          <FontAwesomeIcon className="w-4" icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td className="w-full select-none">Machine Identity Management</Td>
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
                    name={`permissions.identity.${action}`}
                    key={`permissions.identity.${action}`}
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
                        id={`permissions.identity.${action}`}
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

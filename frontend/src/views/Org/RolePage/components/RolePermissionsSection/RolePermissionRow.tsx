import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, Select, SelectItem, Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TFormSchema } from "@app/views/Org/MembersPage/components/OrgRoleTabSection/OrgRoleModifySection/OrgRoleModifySection.utils";

const PERMISSIONS = [
  { action: "read", label: "View" },
  { action: "create", label: "Create" },
  { action: "edit", label: "Modify" },
  { action: "delete", label: "Remove" }
] as const;

const SECRET_SCANNING_PERMISSIONS = [
  { action: "read", label: "View risks" },
  { action: "create", label: "Add integrations" },
  { action: "edit", label: "Edit risk status" },
  { action: "delete", label: "Remove integrations" }
] as const;

const INCIDENT_CONTACTS_PERMISSIONS = [
  { action: "read", label: "View contacts" },
  { action: "create", label: "Add new contacts" },
  { action: "edit", label: "Edit contacts" },
  { action: "delete", label: "Remove contacts" }
] as const;

const MEMBERS_PERMISSIONS = [
  { action: "read", label: "View all members" },
  { action: "create", label: "Invite members" },
  { action: "edit", label: "Edit members" },
  { action: "delete", label: "Remove members" }
] as const;

const BILLING_PERMISSIONS = [
  { action: "read", label: "View bills" },
  { action: "create", label: "Add payment methods" },
  { action: "edit", label: "Edit payments" },
  { action: "delete", label: "Remove payments" }
] as const;

const getPermissionList = (option: string) => {
  switch (option) {
    case "secret-scanning":
      return SECRET_SCANNING_PERMISSIONS;
    case "billing":
      return BILLING_PERMISSIONS;
    case "incident-contact":
      return INCIDENT_CONTACTS_PERMISSIONS;
    case "member":
      return MEMBERS_PERMISSIONS;
    default:
      return PERMISSIONS;
  }
};

type Props = {
  isEditable: boolean;
  title: string;
  formName: keyof Omit<Exclude<TFormSchema["permissions"], undefined>, "workspace">;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-acess",
  Custom = "custom"
}

export const RolePermissionRow = ({ isEditable, title, formName, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: `permissions.${formName}`
  });

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSIONS.length;
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
          `permissions.${formName}`,
          { read: false, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          `permissions.${formName}`,
          { read: true, edit: true, create: true, delete: true },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          `permissions.${formName}`,
          { read: true, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          `permissions.${formName}`,
          { read: false, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <>
      <Tr
        className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td>
          <FontAwesomeIcon icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td>{title}</Td>
        <Td>
          <Select
            value={selectedPermissionCategory}
            className="w-40 bg-mineshaft-600"
            dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
            onValueChange={handlePermissionChange}
            isDisabled={!isEditable}
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
          <Td
            colSpan={3}
            className={`bg-bunker-600 px-0 py-0 ${isRowExpanded && " border-mineshaft-500 p-8"}`}
          >
            <div className="grid grid-cols-3 gap-4">
              {getPermissionList(formName).map(({ action, label }) => {
                return (
                  <Controller
                    name={`permissions.${formName}.${action}`}
                    key={`permissions.${formName}.${action}`}
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
                        id={`permissions.${formName}.${action}`}
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

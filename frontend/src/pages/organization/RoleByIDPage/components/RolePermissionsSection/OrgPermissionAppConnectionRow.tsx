import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, Select, SelectItem, Td, Tr } from "@app/components/v2";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";

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

const PERMISSION_ACTIONS = [
  { action: OrgPermissionAppConnectionActions.Read, label: "Read" },
  { action: OrgPermissionAppConnectionActions.Create, label: "Create" },
  { action: OrgPermissionAppConnectionActions.Edit, label: "Modify" },
  { action: OrgPermissionAppConnectionActions.Delete, label: "Remove" },
  { action: OrgPermissionAppConnectionActions.Connect, label: "Connect" }
] as const;

export const OrgPermissionAppConnectionRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.app-connections"
  });

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSION_ACTIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (isCustom) return Permission.Custom;
    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (score === 1 && rule?.[OrgPermissionAppConnectionActions.Read]) return Permission.ReadOnly;

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
    if (!val) return;
    if (val === Permission.Custom) {
      setIsRowExpanded.on();
      setIsCustom.on();
      return;
    }
    setIsCustom.off();

    switch (val) {
      case Permission.FullAccess:
        setValue(
          "permissions.app-connections",
          {
            [OrgPermissionAppConnectionActions.Read]: true,
            [OrgPermissionAppConnectionActions.Edit]: true,
            [OrgPermissionAppConnectionActions.Create]: true,
            [OrgPermissionAppConnectionActions.Delete]: true,
            [OrgPermissionAppConnectionActions.Connect]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.app-connections",
          {
            [OrgPermissionAppConnectionActions.Read]: true,
            [OrgPermissionAppConnectionActions.Edit]: false,
            [OrgPermissionAppConnectionActions.Create]: false,
            [OrgPermissionAppConnectionActions.Delete]: false,
            [OrgPermissionAppConnectionActions.Connect]: false
          },
          { shouldDirty: true }
        );
        break;

      case Permission.NoAccess:
      default:
        setValue(
          "permissions.app-connections",
          {
            [OrgPermissionAppConnectionActions.Read]: false,
            [OrgPermissionAppConnectionActions.Edit]: false,
            [OrgPermissionAppConnectionActions.Create]: false,
            [OrgPermissionAppConnectionActions.Delete]: false,
            [OrgPermissionAppConnectionActions.Connect]: false
          },
          { shouldDirty: true }
        );
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
        <Td className="w-full select-none">App Connections</Td>
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
                    name={`permissions.app-connections.${action}`}
                    key={`permissions.app-connections.${action}`}
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
                        id={`permissions.app-connections.${action}`}
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

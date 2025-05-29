import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, Select, SelectItem, Td, Tr } from "@app/components/v2";
import { OrgPermissionBillingActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";

const PERMISSION_ACTIONS = [
  { action: OrgPermissionBillingActions.Read, label: "View bills" },
  { action: OrgPermissionBillingActions.ManageBilling, label: "Manage billing" }
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

export const OrgPermissionBillingRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.billing"
  });

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSION_ACTIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (isCustom) return Permission.Custom;
    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (score === 1 && rule?.[OrgPermissionBillingActions.Read]) return Permission.ReadOnly;
    return Permission.Custom;
  }, [rule, isCustom]);

  useEffect(() => {
    if (selectedPermissionCategory === Permission.Custom) setIsCustom.on();
    else setIsCustom.off();
  }, [selectedPermissionCategory]);

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
          "permissions.billing",
          {
            [OrgPermissionBillingActions.Read]: false,
            [OrgPermissionBillingActions.ManageBilling]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.billing",
          {
            [OrgPermissionBillingActions.Read]: true,
            [OrgPermissionBillingActions.ManageBilling]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.billing",
          {
            [OrgPermissionBillingActions.Read]: true,
            [OrgPermissionBillingActions.ManageBilling]: true
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.billing",
          {
            [OrgPermissionBillingActions.Read]: false,
            [OrgPermissionBillingActions.ManageBilling]: false
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
        <Td>
          <FontAwesomeIcon icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td>Billing</Td>
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
            className={`bg-bunker-600 px-0 py-0 ${isRowExpanded && "border-mineshaft-500 p-8"}`}
          >
            <div className="grid grid-cols-3 gap-4">
              {PERMISSION_ACTIONS.map(({ action, label }) => {
                return (
                  <Controller
                    name={`permissions.billing.${action}`}
                    key={`permissions.billing.${action}`}
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
                        id={`permissions.billing.${action}`}
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

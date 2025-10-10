import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Checkbox, Select, SelectItem, Td, Tr } from "@app/components/v2";
import { OrgPermissionMachineIdentityAuthTemplateActions } from "@app/context/OrgPermissionContext/types";
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
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
    label: "List Templates"
  },
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates,
    label: "Create Templates"
  },
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates,
    label: "Edit Templates"
  },
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates,
    label: "Delete Templates"
  },
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates,
    label: "Unlink Templates"
  },
  {
    action: OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    label: "Attach Templates"
  }
] as const;

export const OrgPermissionMachineIdentityAuthTemplateRow = ({
  isEditable,
  control,
  setValue
}: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.machine-identity-auth-template"
  });

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSION_ACTIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (isCustom) return Permission.Custom;
    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (score === 1 && rule?.[OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates])
      return Permission.ReadOnly;

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
          "permissions.machine-identity-auth-template",
          {
            [OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates]: true,
            [OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates]: true,
            [OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates]: true,
            [OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates]: true,
            [OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates]: true,
            [OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.machine-identity-auth-template",
          {
            [OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates]: true,
            [OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates]: true
          },
          { shouldDirty: true }
        );
        break;

      case Permission.NoAccess:
      default:
        setValue(
          "permissions.machine-identity-auth-template",
          {
            [OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates]: false,
            [OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates]: false
          },
          { shouldDirty: true }
        );
    }
  };

  return (
    <>
      <Tr
        className="hover:bg-mineshaft-700 h-10 cursor-pointer transition-colors duration-100"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td className="w-4">
          <FontAwesomeIcon className="w-4" icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td className="w-full select-none">Machine Identity Auth Templates</Td>
        <Td>
          <Select
            value={selectedPermissionCategory}
            className="bg-mineshaft-700 h-8 w-40"
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
            <div className="flex grow flex-wrap justify-start gap-x-8 gap-y-4">
              {PERMISSION_ACTIONS.map(({ action, label }) => {
                return (
                  <Controller
                    name={`permissions.machine-identity-auth-template.${action}`}
                    key={`permissions.machine-identity-auth-template.${action}`}
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        isChecked={Boolean(field.value)}
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
                        id={`permissions.machine-identity-auth-template.${action}`}
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

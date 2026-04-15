import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";

import {
  PermissionActionSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
} from "@app/components/v3";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { ORG_PERMISSION_OBJECT, TFormSchema } from "../OrgRoleModifySection.utils";
import { useOrgPermissionActions } from "./OrgPermissionRowComponents";

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

export const OrgGatewayPermissionRow = ({ isEditable, control, setValue }: Props) => {
  const [isCustom, setIsCustom] = useToggle();

  const { rule, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: "permissions.gateway",
    permissionActions: ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Gateway].actions
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Gateway].actions.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (score === 1 && rule?.[OrgGatewayPermissionActions.ListGateways]) return Permission.ReadOnly;
    if (isCustom) return Permission.Custom;

    return Permission.Custom;
  }, [rule, isCustom]);

  useEffect(() => {
    if (selectedPermissionCategory === Permission.Custom) setIsCustom.on();
    else setIsCustom.off();
  }, [selectedPermissionCategory]);

  const handlePermissionChange = (val: Permission) => {
    if (!val) return;
    if (val === Permission.Custom) {
      setIsCustom.on();
      return;
    }
    setIsCustom.off();

    switch (val) {
      case Permission.FullAccess:
        setValue(
          "permissions.gateway",
          {
            [OrgGatewayPermissionActions.ListGateways]: true,
            [OrgGatewayPermissionActions.EditGateways]: true,
            [OrgGatewayPermissionActions.CreateGateways]: true,
            [OrgGatewayPermissionActions.DeleteGateways]: true,
            [OrgGatewayPermissionActions.AttachGateways]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.gateway",
          {
            [OrgGatewayPermissionActions.ListGateways]: true,
            [OrgGatewayPermissionActions.EditGateways]: false,
            [OrgGatewayPermissionActions.CreateGateways]: false,
            [OrgGatewayPermissionActions.DeleteGateways]: false,
            [OrgGatewayPermissionActions.AttachGateways]: false
          },
          { shouldDirty: true }
        );
        break;

      case Permission.NoAccess:
      default:
        setValue(
          "permissions.gateway",
          {
            [OrgGatewayPermissionActions.ListGateways]: false,
            [OrgGatewayPermissionActions.EditGateways]: false,
            [OrgGatewayPermissionActions.CreateGateways]: false,
            [OrgGatewayPermissionActions.DeleteGateways]: false,
            [OrgGatewayPermissionActions.AttachGateways]: false
          },
          { shouldDirty: true }
        );
    }
  };

  return (
    <UnstableAccordionItem value={OrgPermissionSubjects.Gateway}>
      <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
        <div className="flex flex-1 items-center gap-2 text-left">
          <div className="flex grow flex-col">
            <span className="text-base select-none">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Gateway].title}
            </span>
            <span className="text-sm text-muted">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Gateway].description}
            </span>
          </div>
          <div role="none" onClick={(e) => e.stopPropagation()}>
            <Select
              value={selectedPermissionCategory}
              onValueChange={handlePermissionChange}
              disabled={!isEditable}
            >
              <SelectTrigger className="h-8 w-40 bg-mineshaft-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="border text-left border-mineshaft-600 bg-mineshaft-800"
              >
                <SelectItem value={Permission.NoAccess}>No Access</SelectItem>
                <SelectItem value={Permission.ReadOnly}>Read Only</SelectItem>
                <SelectItem value={Permission.FullAccess}>Full Access</SelectItem>
                <SelectItem value={Permission.Custom}>
                  {selectedPermissionCategory === Permission.Custom
                    ? `Custom (${selectedCount})`
                    : "Custom"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </UnstableAccordionTrigger>
      <UnstableAccordionContent className="!p-0">
        <div className="bg-mineshaft-800 px-6 py-4">
          <PermissionActionSelect
            value={selectedActions}
            onChange={handleActionsChange}
            options={ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Gateway].actions}
            placeholder={isEditable ? "Select actions..." : "No actions allowed"}
            isDisabled={!isEditable}
            isClearable={isEditable}
            className="w-full"
            menuPosition="fixed"
          />
        </div>
      </UnstableAccordionContent>
    </UnstableAccordionItem>
  );
};

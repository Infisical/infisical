import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";

import { Select, SelectItem } from "@app/components/v2";
import {
  PermissionActionSelect,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
} from "@app/components/v3";
import { OrgPermissionActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { ORG_PERMISSION_OBJECT, TFormSchema } from "../OrgRoleModifySection.utils";
import { useOrgPermissionActions } from "./OrgPermissionRowComponents";

type Props = {
  isEditable: boolean;
  title: string;
  description?: string;
  formName: keyof Omit<
    Exclude<TFormSchema["permissions"], undefined>,
    | "project"
    | "organization-admin-console"
    | "kmip"
    | "gateway"
    | "relay"
    | "secret-share"
    | "billing"
    | "audit-logs"
    | "machine-identity-auth-template"
    | "sub-organization"
    | "sso"
    | "email-domains"
    | "app-connections"
    | "identity"
    | "groups"
  >;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-acess",
  Custom = "custom"
}

export const RolePermissionRow = ({ isEditable, title, description, formName, control, setValue }: Props) => {
  const [isCustom, setIsCustom] = useToggle();

  const permissionActions = ORG_PERMISSION_OBJECT[formName].actions;

  const { rule, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: `permissions.${formName}`,
    permissionActions
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = permissionActions.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (isCustom) return Permission.Custom;
    if (score === 1 && rule?.[OrgPermissionActions.Read]) return Permission.ReadOnly;

    return Permission.Custom;
  }, [rule, isCustom, permissionActions]);

  useEffect(() => {
    if (selectedPermissionCategory === Permission.Custom) setIsCustom.on();
    else setIsCustom.off();
  }, [selectedPermissionCategory]);

  const handlePermissionChange = (val: Permission) => {
    if (val === Permission.Custom) {
      setIsCustom.on();
      return;
    }
    setIsCustom.off();

    const allFalse = Object.fromEntries(permissionActions.map(({ value }) => [value, false]));
    const allTrue = Object.fromEntries(permissionActions.map(({ value }) => [value, true]));

    switch (val) {
      case Permission.NoAccess:
        setValue(`permissions.${formName}`, allFalse as any, { shouldDirty: true });
        break;
      case Permission.FullAccess:
        setValue(`permissions.${formName}`, allTrue as any, { shouldDirty: true });
        break;
      case Permission.ReadOnly:
        setValue(
          `permissions.${formName}`,
          {
            ...allFalse,
            [OrgPermissionActions.Read]: true
          } as any,
          { shouldDirty: true }
        );
        break;
      default:
        setValue(`permissions.${formName}`, allFalse as any, { shouldDirty: true });
        break;
    }
  };

  return (
    <UnstableAccordionItem value={formName}>
      <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
        <div className="flex flex-1 items-center gap-2 text-left">
          <div className="flex grow flex-col">
            <span className="select-none text-base">{title}</span>
            {description && <span className="text-sm text-muted">{description}</span>}
          </div>
          <div role="none" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      </UnstableAccordionTrigger>
      <UnstableAccordionContent className="!p-0">
        <div className="bg-mineshaft-800 px-6 py-4">
          <PermissionActionSelect
            value={selectedActions}
            onChange={handleActionsChange}
            options={permissionActions}
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

import { useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";

import { Select, SelectItem } from "@app/components/v2";
import {
  PermissionActionSelect,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
} from "@app/components/v3";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { ORG_PERMISSION_OBJECT, TFormSchema } from "../OrgRoleModifySection.utils";
import { useOrgPermissionActions } from "./OrgPermissionRowComponents";

type Props = {
  isEditable: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  Custom = "custom"
}

export const OrgPermissionAdminConsoleRow = ({ isEditable, control, setValue }: Props) => {
  const { rule, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: "permissions.organization-admin-console",
    permissionActions: ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AdminConsole].actions
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    if (rule?.[OrgPermissionAdminConsoleAction.AccessAllProjects]) {
      return Permission.Custom;
    }
    return Permission.NoAccess;
  }, [rule]);

  const handlePermissionChange = (val: Permission) => {
    if (!val) return;
    if (val === Permission.Custom) {
      return;
    }

    if (val === Permission.NoAccess) {
      setValue(
        "permissions.organization-admin-console",
        { [OrgPermissionAdminConsoleAction.AccessAllProjects]: false },
        { shouldDirty: true }
      );
    }
  };

  return (
    <UnstableAccordionItem value={OrgPermissionSubjects.AdminConsole}>
      <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
        <div className="flex flex-1 items-center gap-2 text-left">
          <div className="flex grow flex-col">
            <span className="text-base select-none">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AdminConsole].title}
            </span>
            <span className="text-sm text-muted">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AdminConsole].description}
            </span>
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
            options={ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AdminConsole].actions}
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

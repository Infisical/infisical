import { useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";
import { TrashIcon } from "lucide-react";

import {
  PermissionActionSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger,
  UnstableIconButton
} from "@app/components/v3";
import {
  OrgPermissionAuditLogsActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { ORG_PERMISSION_OBJECT, TFormSchema } from "../OrgRoleModifySection.utils";
import { useOrgPermissionActions } from "./OrgPermissionRowComponents";

type Props = {
  isEditable: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
  onDelete?: () => void;
};

enum Permission {
  NoAccess = "no-access",
  Custom = "custom"
}

export const OrgPermissionAuditLogsRow = ({ isEditable, control, setValue, onDelete }: Props) => {
  const { rule, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: "permissions.audit-logs",
    permissionActions: ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AuditLogs].actions
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    return Permission.Custom;
  }, [rule]);

  const handlePermissionChange = (val: Permission) => {
    if (!val) return;
    if (val === Permission.Custom) return;

    switch (val) {
      case Permission.NoAccess:
      default:
        setValue(
          "permissions.audit-logs",
          {
            [OrgPermissionAuditLogsActions.Read]: false
          },
          { shouldDirty: true }
        );
    }
  };

  return (
    <UnstableAccordionItem value={OrgPermissionSubjects.AuditLogs}>
      <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
        <div className="flex flex-1 items-center gap-2 text-left">
          <div className="flex grow flex-col">
            <span className="text-base select-none">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AuditLogs].title}
            </span>
            <span className="text-sm text-muted">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AuditLogs].description}
            </span>
          </div>
          <div role="none" className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                className="border border-mineshaft-600 bg-mineshaft-800 text-left"
              >
                <SelectItem value={Permission.NoAccess}>No Access</SelectItem>
                <SelectItem value={Permission.Custom}>
                  {selectedPermissionCategory === Permission.Custom
                    ? `Custom (${selectedCount})`
                    : "Custom"}
                </SelectItem>
              </SelectContent>
            </Select>
            {isEditable && onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <UnstableIconButton
                    type="button"
                    variant="danger"
                    aria-label="Remove policy"
                    onClick={onDelete}
                  >
                    <TrashIcon className="size-4" />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent side="top">Remove Policy</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </UnstableAccordionTrigger>
      <UnstableAccordionContent className="!p-0">
        <div className="bg-container px-6 py-4">
          <PermissionActionSelect
            value={selectedActions}
            onChange={handleActionsChange}
            options={ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AuditLogs].actions}
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

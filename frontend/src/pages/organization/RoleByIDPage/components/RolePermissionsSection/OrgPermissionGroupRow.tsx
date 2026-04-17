import { useEffect, useMemo } from "react";
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
  OrgPermissionGroupActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

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
  ReadOnly = "read-only",
  FullAccess = "full-access",
  Custom = "custom"
}

export const OrgPermissionGroupRow = ({ isEditable, control, setValue, onDelete }: Props) => {
  const [isCustom, setIsCustom] = useToggle();

  const { rule, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: "permissions.groups",
    permissionActions: ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Groups].actions
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Groups].actions.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (score === 1 && rule?.[OrgPermissionGroupActions.Read]) return Permission.ReadOnly;
    if (isCustom) return Permission.Custom;

    return Permission.Custom;
  }, [rule, isCustom]);

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

    switch (val) {
      case Permission.NoAccess:
        setValue(
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: false,
            [OrgPermissionGroupActions.Create]: false,
            [OrgPermissionGroupActions.Edit]: false,
            [OrgPermissionGroupActions.Delete]: false,
            [OrgPermissionGroupActions.GrantPrivileges]: false,
            [OrgPermissionGroupActions.AddMembers]: false,
            [OrgPermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: true,
            [OrgPermissionGroupActions.Create]: true,
            [OrgPermissionGroupActions.Edit]: true,
            [OrgPermissionGroupActions.Delete]: true,
            [OrgPermissionGroupActions.GrantPrivileges]: true,
            [OrgPermissionGroupActions.AddMembers]: true,
            [OrgPermissionGroupActions.RemoveMembers]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: true,
            [OrgPermissionGroupActions.Edit]: false,
            [OrgPermissionGroupActions.Create]: false,
            [OrgPermissionGroupActions.Delete]: false,
            [OrgPermissionGroupActions.GrantPrivileges]: false,
            [OrgPermissionGroupActions.AddMembers]: false,
            [OrgPermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.groups",
          {
            [OrgPermissionGroupActions.Read]: false,
            [OrgPermissionGroupActions.Edit]: false,
            [OrgPermissionGroupActions.Create]: false,
            [OrgPermissionGroupActions.Delete]: false,
            [OrgPermissionGroupActions.GrantPrivileges]: false,
            [OrgPermissionGroupActions.AddMembers]: false,
            [OrgPermissionGroupActions.RemoveMembers]: false
          },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <UnstableAccordionItem value={OrgPermissionSubjects.Groups}>
      <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
        <div className="flex flex-1 items-center gap-2 text-left">
          <div className="flex grow flex-col">
            <span className="text-base select-none">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Groups].title}
            </span>
            <span className="text-sm text-muted">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Groups].description}
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
                <SelectItem value={Permission.ReadOnly}>Read Only</SelectItem>
                <SelectItem value={Permission.FullAccess}>Full Access</SelectItem>
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
            options={ORG_PERMISSION_OBJECT[OrgPermissionSubjects.Groups].actions}
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

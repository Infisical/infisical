import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";

import { Select, SelectItem } from "@app/components/v2";
import {
  FilterableSelect,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
} from "@app/components/v3";
import {
  OrgPermissionSubjects,
  OrgPermissionSubOrgActions
} from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { ORG_PERMISSION_OBJECT, TFormSchema } from "../OrgRoleModifySection.utils";
import {
  MultiValueRemove,
  MultiValueWithTooltip,
  OptionWithDescription,
  useOrgPermissionActions
} from "./OrgPermissionRowComponents";

type Props = {
  isEditable: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  FullAccess = "full-access",
  Custom = "custom"
}

export const OrgPermissionSubOrgRow = ({ isEditable, control, setValue }: Props) => {
  const [isCustom, setIsCustom] = useToggle();

  const { rule, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: "permissions.sub-organization",
    permissionActions: ORG_PERMISSION_OBJECT[OrgPermissionSubjects.SubOrganization].actions
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions =
      ORG_PERMISSION_OBJECT[OrgPermissionSubjects.SubOrganization].actions.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
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
          "permissions.sub-organization",
          {
            [OrgPermissionSubOrgActions.Create]: false,
            [OrgPermissionSubOrgActions.Edit]: false,
            [OrgPermissionSubOrgActions.Delete]: false,
            [OrgPermissionSubOrgActions.DirectAccess]: false,
            [OrgPermissionSubOrgActions.LinkGroup]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.sub-organization",
          {
            [OrgPermissionSubOrgActions.Create]: true,
            [OrgPermissionSubOrgActions.Edit]: true,
            [OrgPermissionSubOrgActions.Delete]: true,
            [OrgPermissionSubOrgActions.DirectAccess]: true,
            [OrgPermissionSubOrgActions.LinkGroup]: true
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.sub-organization",
          {
            [OrgPermissionSubOrgActions.Create]: true,
            [OrgPermissionSubOrgActions.Edit]: true,
            [OrgPermissionSubOrgActions.Delete]: true,
            [OrgPermissionSubOrgActions.DirectAccess]: true,
            [OrgPermissionSubOrgActions.LinkGroup]: true
          },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <UnstableAccordionItem value={OrgPermissionSubjects.SubOrganization}>
      <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
        <div className="flex flex-1 items-center gap-2 text-left">
          <div className="flex grow flex-col">
            <span className="text-base select-none">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.SubOrganization].title}
            </span>
            <span className="text-sm text-muted">
              {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.SubOrganization].description}
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
          <FilterableSelect
            isMulti
            value={selectedActions}
            onChange={handleActionsChange}
            options={ORG_PERMISSION_OBJECT[OrgPermissionSubjects.SubOrganization].actions}
            placeholder={isEditable ? "Select actions..." : "No actions allowed"}
            isDisabled={!isEditable}
            isClearable={isEditable}
            className="w-full"
            menuPosition="fixed"
            components={{
              Option: OptionWithDescription,
              MultiValueRemove,
              MultiValue: MultiValueWithTooltip
            }}
          />
        </div>
      </UnstableAccordionContent>
    </UnstableAccordionItem>
  );
};

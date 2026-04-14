import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { FilterableSelect } from "@app/components/v3";
import { OrgPermissionSsoActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";
import {
  MultiValueRemove,
  MultiValueWithTooltip,
  OptionWithDescription,
  useOrgPermissionActions
} from "./OrgPermissionRowComponents";

const PERMISSION_ACTIONS = [
  { action: OrgPermissionSsoActions.Read, label: "View", description: "View SSO configuration" },
  {
    action: OrgPermissionSsoActions.Create,
    label: "Create",
    description: "Set up new SSO providers"
  },
  {
    action: OrgPermissionSsoActions.Edit,
    label: "Modify",
    description: "Update SSO configuration"
  },
  {
    action: OrgPermissionSsoActions.Delete,
    label: "Remove",
    description: "Remove SSO providers"
  },
  {
    action: OrgPermissionSsoActions.BypassSsoEnforcement,
    label: "Bypass SSO Enforcement",
    description: "Allow login without SSO when enforcement is enabled"
  }
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

export const OrgPermissionSsoRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const { rule, actionOptions, selectedActions, handleActionsChange } = useOrgPermissionActions({
    control,
    setValue,
    formPath: "permissions.sso",
    permissionActions: PERMISSION_ACTIONS
  });

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSION_ACTIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (isCustom) return Permission.Custom;
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
          "permissions.sso",
          {
            [OrgPermissionSsoActions.Read]: false,
            [OrgPermissionSsoActions.Create]: false,
            [OrgPermissionSsoActions.Edit]: false,
            [OrgPermissionSsoActions.Delete]: false,
            [OrgPermissionSsoActions.BypassSsoEnforcement]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.sso",
          {
            [OrgPermissionSsoActions.Read]: true,
            [OrgPermissionSsoActions.Create]: true,
            [OrgPermissionSsoActions.Edit]: true,
            [OrgPermissionSsoActions.Delete]: true,
            [OrgPermissionSsoActions.BypassSsoEnforcement]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.sso",
          {
            [OrgPermissionSsoActions.Read]: true,
            [OrgPermissionSsoActions.Create]: false,
            [OrgPermissionSsoActions.Edit]: false,
            [OrgPermissionSsoActions.Delete]: false,
            [OrgPermissionSsoActions.BypassSsoEnforcement]: false
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.sso",
          {
            [OrgPermissionSsoActions.Read]: false,
            [OrgPermissionSsoActions.Create]: false,
            [OrgPermissionSsoActions.Edit]: false,
            [OrgPermissionSsoActions.Delete]: false,
            [OrgPermissionSsoActions.BypassSsoEnforcement]: false
          },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <>
      <Tr
        className="min-h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td className="w-4">
          <FontAwesomeIcon className="w-4" icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td className="w-full select-none">
          <p>SSO</p>
          <p className="text-xs text-mineshaft-400">
            Configure and enforce single sign-on authentication for the organization
          </p>
        </Td>
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
            <SelectItem value={Permission.Custom}>
              {selectedPermissionCategory === Permission.Custom
                ? `Custom (${selectedCount})`
                : "Custom"}
            </SelectItem>
          </Select>
        </Td>
      </Tr>
      {isRowExpanded && (
        <Tr>
          <Td colSpan={3} className="bg-mineshaft-800 px-6 py-4">
            <FilterableSelect
              isMulti
              value={selectedActions}
              onChange={handleActionsChange}
              options={actionOptions}
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
          </Td>
        </Tr>
      )}
    </>
  );
};

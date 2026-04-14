import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { FilterableSelect } from "@app/components/v3";
import { useToggle } from "@app/hooks";

import { OrgPermissionAdminConsoleAction, OrgPermissionSubjects } from "@app/context/OrgPermissionContext/types";

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
  Custom = "custom"
}

export const OrgPermissionAdminConsoleRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

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

    if (val === Permission.NoAccess) {
      setValue(
        "permissions.organization-admin-console",
        { [OrgPermissionAdminConsoleAction.AccessAllProjects]: false },
        { shouldDirty: true }
      );
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
          <p>{ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AdminConsole].title}</p>
          <p className="text-xs text-mineshaft-400">
            {ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AdminConsole].description}
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
              options={ORG_PERMISSION_OBJECT[OrgPermissionSubjects.AdminConsole].actions}
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

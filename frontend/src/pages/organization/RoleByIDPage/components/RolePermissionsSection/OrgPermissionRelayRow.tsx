import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { FilterableSelect } from "@app/components/v3";
import { OrgRelayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "../OrgRoleModifySection.utils";
import {
  MultiValueRemove,
  MultiValueWithTooltip,
  OptionWithDescription
} from "./OrgPermissionRowComponents";

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
    action: OrgRelayPermissionActions.ListRelays,
    label: "List Relays",
    description: "View available relay servers"
  },
  {
    action: OrgRelayPermissionActions.CreateRelays,
    label: "Create Relays",
    description: "Add new relay servers for network tunneling"
  },
  {
    action: OrgRelayPermissionActions.EditRelays,
    label: "Edit Relays",
    description: "Update relay server configuration"
  },
  {
    action: OrgRelayPermissionActions.DeleteRelays,
    label: "Delete Relays",
    description: "Remove relay servers"
  }
] as const;

const actionOptions = PERMISSION_ACTIONS.map(({ action, label, description }) => ({
  value: action as string,
  label,
  description
}));

export const OrgRelayPermissionRow = ({ isEditable, control, setValue }: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: "permissions.relay"
  });

  const selectedActions = useMemo(
    () => actionOptions.filter((opt) => Boolean(rule?.[opt.value as keyof typeof rule])),
    [rule]
  );

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSION_ACTIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (isCustom) return Permission.Custom;
    if (score === 1 && rule?.[OrgRelayPermissionActions.ListRelays]) return Permission.ReadOnly;

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
          "permissions.relay",
          {
            [OrgRelayPermissionActions.ListRelays]: true,
            [OrgRelayPermissionActions.EditRelays]: true,
            [OrgRelayPermissionActions.CreateRelays]: true,
            [OrgRelayPermissionActions.DeleteRelays]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.relay",
          {
            [OrgRelayPermissionActions.ListRelays]: true,
            [OrgRelayPermissionActions.EditRelays]: false,
            [OrgRelayPermissionActions.CreateRelays]: false,
            [OrgRelayPermissionActions.DeleteRelays]: false
          },
          { shouldDirty: true }
        );
        break;

      case Permission.NoAccess:
      default:
        setValue(
          "permissions.relay",
          {
            [OrgRelayPermissionActions.ListRelays]: false,
            [OrgRelayPermissionActions.EditRelays]: false,
            [OrgRelayPermissionActions.CreateRelays]: false,
            [OrgRelayPermissionActions.DeleteRelays]: false
          },
          { shouldDirty: true }
        );
    }
  };

  const handleActionsChange = (newValue: unknown) => {
    const selected = Array.isArray(newValue) ? newValue : [];
    const updated = Object.fromEntries(
      PERMISSION_ACTIONS.map(({ action }) => [
        action,
        selected.some((s: { value: string }) => s.value === action)
      ])
    );
    setValue("permissions.relay", updated as any, { shouldDirty: true });
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
          <p>Relays</p>
          <p className="text-xs text-mineshaft-400">
            Manage relay servers used for secure network tunneling
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

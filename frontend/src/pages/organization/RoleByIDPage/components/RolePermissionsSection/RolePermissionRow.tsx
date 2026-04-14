import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { PermissionActionSelect } from "@app/components/v3";
import { OrgPermissionSubjects } from "@app/context";
import { useToggle } from "@app/hooks";
import { OrgPermissionActions } from "@app/context/OrgPermissionContext/types";

import { TFormSchema } from "../OrgRoleModifySection.utils";

const PERMISSIONS = [
  { action: OrgPermissionActions.Read, label: "View", description: undefined as string | undefined },
  { action: OrgPermissionActions.Create, label: "Create", description: undefined as string | undefined },
  { action: OrgPermissionActions.Edit, label: "Modify", description: undefined as string | undefined },
  { action: OrgPermissionActions.Delete, label: "Remove", description: undefined as string | undefined }
] as const;

const SECRET_SCANNING_PERMISSIONS = [
  { action: OrgPermissionActions.Read, label: "View risks" },
  { action: OrgPermissionActions.Create, label: "Add integrations" },
  { action: OrgPermissionActions.Edit, label: "Edit risk status" },
  { action: OrgPermissionActions.Delete, label: "Remove integrations" }
] as const;

const INCIDENT_CONTACTS_PERMISSIONS = [
  { action: OrgPermissionActions.Read, label: "View contacts" },
  { action: OrgPermissionActions.Create, label: "Add new contacts" },
  { action: OrgPermissionActions.Edit, label: "Edit contacts" },
  { action: OrgPermissionActions.Delete, label: "Remove contacts" }
] as const;

const MEMBERS_PERMISSIONS = [
  { action: OrgPermissionActions.Read, label: "View all members" },
  { action: OrgPermissionActions.Create, label: "Invite members" },
  { action: OrgPermissionActions.Edit, label: "Edit members" },
  { action: OrgPermissionActions.Delete, label: "Remove members" }
] as const;

const PROJECT_TEMPLATES_PERMISSIONS = [
  { action: OrgPermissionActions.Read, label: "View & Apply" },
  { action: OrgPermissionActions.Create, label: "Create" },
  { action: OrgPermissionActions.Edit, label: "Modify" },
  { action: OrgPermissionActions.Delete, label: "Remove" }
] as const;

const getPermissionList = (formName: Props["formName"]) => {
  switch (formName) {
    case OrgPermissionSubjects.Member:
      return MEMBERS_PERMISSIONS;
    case OrgPermissionSubjects.ProjectTemplates:
      return PROJECT_TEMPLATES_PERMISSIONS;
    case OrgPermissionSubjects.SecretScanning:
      return SECRET_SCANNING_PERMISSIONS;
    case OrgPermissionSubjects.IncidentAccount:
      return INCIDENT_CONTACTS_PERMISSIONS;
    default:
      return PERMISSIONS;
  }
};

type Props = {
  isEditable: boolean;
  title: string;
  description?: string;
  actionDescriptions?: Partial<Record<string, string>>;
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

export const RolePermissionRow = ({
  isEditable,
  title,
  description,
  actionDescriptions,
  formName,
  control,
  setValue
}: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  const [isCustom, setIsCustom] = useToggle();

  const rule = useWatch({
    control,
    name: `permissions.${formName}`
  });

  const permissionList = getPermissionList(formName);

  const actionOptions = useMemo(
    () =>
      permissionList.map(({ action, label }) => ({
        value: action as string,
        label,
        description: actionDescriptions?.[action as string]
      })),
    [permissionList, actionDescriptions]
  );

  const selectedActions = useMemo(
    () => actionOptions.filter((opt) => Boolean(rule?.[opt.value as keyof typeof rule])),
    [actionOptions, rule]
  );

  const selectedCount = selectedActions.length;

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (isCustom) return Permission.Custom;
    if (score === 1 && rule?.[OrgPermissionActions.Read]) return Permission.ReadOnly;

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
          `permissions.${formName}`,
          {
            [OrgPermissionActions.Read]: false,
            [OrgPermissionActions.Edit]: false,
            [OrgPermissionActions.Create]: false,
            [OrgPermissionActions.Delete]: false
          },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          `permissions.${formName}`,
          {
            [OrgPermissionActions.Read]: true,
            [OrgPermissionActions.Edit]: true,
            [OrgPermissionActions.Create]: true,
            [OrgPermissionActions.Delete]: true
          },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          `permissions.${formName}`,
          {
            [OrgPermissionActions.Read]: true,
            [OrgPermissionActions.Edit]: false,
            [OrgPermissionActions.Create]: false,
            [OrgPermissionActions.Delete]: false
          },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          `permissions.${formName}`,
          {
            [OrgPermissionActions.Read]: false,
            [OrgPermissionActions.Edit]: false,
            [OrgPermissionActions.Create]: false,
            [OrgPermissionActions.Delete]: false
          },
          { shouldDirty: true }
        );
        break;
    }
  };

  const handleActionsChange = (newValue: unknown) => {
    const selected = Array.isArray(newValue) ? newValue : [];
    const updated = Object.fromEntries(
      permissionList.map(({ action }) => [
        action,
        selected.some((s: { value: string }) => s.value === action)
      ])
    );
    setValue(`permissions.${formName}`, updated as any, { shouldDirty: true });
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
          <p>{title}</p>
          {description && <p className="text-xs text-mineshaft-400">{description}</p>}
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
            <PermissionActionSelect
              value={selectedActions}
              onChange={handleActionsChange}
              options={actionOptions}
              placeholder={isEditable ? "Select actions..." : "No actions allowed"}
              isDisabled={!isEditable}
              isClearable={isEditable}
              className="w-full"
              menuPosition="fixed"
            />
          </Td>
        </Tr>
      )}
    </>
  );
};

import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { Checkbox, Select, SelectItem } from "@app/components/v2";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "./OrgRoleModifySection.utils";

type Props = {
  formName: keyof Omit<Exclude<TFormSchema["permissions"], undefined>, "workspace">;
  isNonEditable?: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
  title: string;
  subtitle: string;
  icon: IconProp;
};

enum Permission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-acess",
  Custom = "custom"
}

const PERMISSIONS = [
  { action: "read", label: "View" },
  { action: "create", label: "Create" },
  { action: "edit", label: "Modify" },
  { action: "delete", label: "Remove" }
] as const;

const SECRET_SCANNING_PERMISSIONS = [
  { action: "read", label: "View risks" },
  { action: "create", label: "Add integrations" },
  { action: "edit", label: "Edit risk status" },
  { action: "delete", label: "Remove integrations" }
] as const;

const INCIDENT_CONTACTS_PERMISSIONS = [
  { action: "read", label: "View contacts" },
  { action: "create", label: "Add new contacts" },
  { action: "edit", label: "Edit contacts" },
  { action: "delete", label: "Remove contacts" }
] as const;

const MEMBERS_PERMISSIONS = [
  { action: "read", label: "View all members" },
  { action: "create", label: "Invite members" },
  { action: "edit", label: "Edit members" },
  { action: "delete", label: "Remove members" }
] as const;

const BILLING_PERMISSIONS = [
  { action: "read", label: "View bills" },
  { action: "create", label: "Add payment methods" },
  { action: "edit", label: "Edit payments" },
  { action: "delete", label: "Remove payments" }
] as const;

const getPermissionList = (option: Props["formName"]) => {
  switch (option) {
    case "secret-scanning":
      return SECRET_SCANNING_PERMISSIONS;
    case "billing":
      return BILLING_PERMISSIONS;
    case "incident-contact":
      return INCIDENT_CONTACTS_PERMISSIONS;
    case "member":
      return MEMBERS_PERMISSIONS
    default:
      return PERMISSIONS;
  }
};

export const SimpleLevelPermissionOption = ({
  isNonEditable,
  setValue,
  control,
  formName,
  subtitle,
  title,
  icon
}: Props) => {
  const rule = useWatch({
    control,
    name: `permissions.${formName}`
  });
  const [isCustom, setIsCustom] = useToggle();

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSIONS.length;
    const score = actions.map((key) => (rule?.[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (isCustom) return Permission.Custom;
    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (score === 1 && rule?.read) return Permission.ReadOnly;

    return Permission.Custom;
  }, [rule, isCustom]);

  useEffect(() => {
    if (selectedPermissionCategory === Permission.Custom) setIsCustom.on();
    else setIsCustom.off();
  }, [selectedPermissionCategory]);

  const handlePermissionChange = (val: Permission) => {
    if (val === Permission.Custom) setIsCustom.on();
    else setIsCustom.off();

    switch (val) {
      case Permission.NoAccess:
        setValue(
          `permissions.${formName}`,
          { read: false, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          `permissions.${formName}`,
          { read: true, edit: true, create: true, delete: true },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          `permissions.${formName}`,
          { read: true, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          `permissions.${formName}`,
          { read: false, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <div
      className={twMerge(
        "px-10 py-6 bg-mineshaft-800 rounded-md",
        selectedPermissionCategory !== Permission.NoAccess && "border-l-2 border-primary-600"
      )}
    >
      <div className="flex items-center space-x-4">
        <div>
          <FontAwesomeIcon icon={icon} className="text-4xl" />
        </div>
        <div className="flex-grow flex flex-col">
          <div className="font-medium mb-1 text-lg">{title}</div>
          <div className="text-xs font-light">{subtitle}</div>
        </div>
        <div>
          <Select
            defaultValue={Permission.NoAccess}
            isDisabled={isNonEditable}
            value={selectedPermissionCategory}
            onValueChange={handlePermissionChange}
          >
            <SelectItem value={Permission.NoAccess}>No Access</SelectItem>
            <SelectItem value={Permission.ReadOnly}>Read Only</SelectItem>
            <SelectItem value={Permission.FullAccess}>Full Access</SelectItem>
            <SelectItem value={Permission.Custom}>Custom</SelectItem>
          </Select>
        </div>
      </div>
      <motion.div
        initial={false}
        animate={{ height: isCustom ? "2.5rem" : 0, paddingTop: isCustom ? "1rem" : 0 }}
        className="overflow-hidden grid gap-8 grid-flow-col auto-cols-min"
      >
        {isCustom &&
          getPermissionList(formName).map(({ action, label }) => (
            <Controller
              name={`permissions.${formName}.${action}`}
              key={`permissions.${formName}.${action}`}
              control={control}
              render={({ field }) => (
                <Checkbox
                  isChecked={field.value}
                  onCheckedChange={field.onChange}
                  id={`permissions.${formName}.${action}`}
                  isDisabled={isNonEditable}
                >
                  {label}
                </Checkbox>
              )}
            />
          ))}
      </motion.div>
    </div>
  );
};

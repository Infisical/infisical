import { useEffect, useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faSignIn } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { Checkbox, Select, SelectItem } from "@app/components/v2";
import { useToggle } from "@app/hooks";

import { TFormSchema } from "./OrgRoleModifySection.utils";

type Props = {
  isNonEditable?: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-acess",
  Custom = "custom"
}

const PERMISSIONS = [
  { action: "read", label: "Read" },
  { action: "create", label: "Create" },
  { action: "edit", label: "Update" },
  { action: "delete", label: "Remove" }
] as const;

export const SsoPermission = ({ isNonEditable, setValue, control }: Props) => {
  const rule = useWatch({
    control,
    name: "permissions.sso"
  });
  const [isCustom, setIsCustom] = useToggle();

  const selectedPermissionCategory = useMemo(() => {
    const actions = Object.keys(rule || {}) as Array<keyof typeof rule>;
    const totalActions = PERMISSIONS.length;
    const score = actions.map((key) => (rule[key] ? 1 : 0)).reduce((a, b) => a + b, 0 as number);

    if (isCustom) return Permission.Custom;
    if (score === 0) return Permission.NoAccess;
    if (score === totalActions) return Permission.FullAccess;
    if (score === 1 && rule.read) return Permission.ReadOnly;

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
          "permissions.sso",
          { read: false, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
      case Permission.FullAccess:
        setValue(
          "permissions.sso",
          { read: true, edit: true, create: true, delete: true },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          "permissions.sso",
          { read: true, edit: false, create: false, delete: false },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.sso",
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
          <FontAwesomeIcon icon={faSignIn} className="text-4xl" />
        </div>
        <div className="flex-grow flex flex-col">
          <div className="font-medium mb-1 text-lg">SSO</div>
          <div className="text-xs font-light">SSO management control</div>
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
          PERMISSIONS.map(({ action, label }) => (
            <Controller
              name={`permissions.sso.${action}`}
              key={`permissions.sso.${action}`}
              control={control}
              render={({ field }) => (
                <Checkbox
                  isChecked={field.value}
                  onCheckedChange={field.onChange}
                  id={`permissions.sso.${action}`}
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

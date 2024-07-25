import { useMemo } from "react";
import {
  Control,
  // Controller,
  UseFormGetValues,
  UseFormSetValue,
  useWatch
} from "react-hook-form";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem,Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TFormSchema } from "@app/views/Project/MembersPage/components/ProjectRoleListTab/components/ProjectRoleModifySection/ProjectRoleModifySection.utils";

type Props = {
  title: string;
  formName: "secrets";
  isEditable: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  getValue: UseFormGetValues<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-acess",
  Custom = "custom"
}

export const RowPermissionSecretsRow = ({
  title,
  formName,
  isEditable,
  setValue,
  getValue,
  control
}: Props) => {
  const [isRowExpanded, setIsRowExpanded] = useToggle();
  //   const [isCustom, setIsCustom] = useToggle();

  const allRule = useWatch({ control, name: `permissions.${formName}.all` });

  const selectedPermissionCategory = useMemo(() => {
    const { read, delete: del, edit, create } = allRule || {};
    if (read && del && edit && create) return Permission.FullAccess;
    if (read) return Permission.ReadOnly;
    return Permission.NoAccess;
  }, [allRule]);

  const handlePermissionChange = (val: Permission) => {
    if (!val) return;
    switch (val) {
      case Permission.NoAccess: {
        const permissions = getValue("permissions");
        if (permissions) delete permissions[formName];
        setValue("permissions", permissions, { shouldDirty: true });
        break;
      }
      case Permission.FullAccess:
        setValue(
          `permissions.${formName}`,
          { all: { read: true, edit: true, create: true, delete: true } },
          { shouldDirty: true }
        );
        break;
      case Permission.ReadOnly:
        setValue(
          `permissions.${formName}`,
          { all: { read: true, edit: false, create: false, delete: false } },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          `permissions.${formName}`,
          { custom: { read: false, edit: false, create: false, delete: false } },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <Tr
        className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
        onClick={() => setIsRowExpanded.toggle()}
      >
        <Td>
          <FontAwesomeIcon icon={isRowExpanded ? faChevronDown : faChevronRight} />
        </Td>
        <Td>{title}</Td>
        <Td>
          <Select
            value={selectedPermissionCategory}
            className="w-40 bg-mineshaft-600"
            dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
            onValueChange={handlePermissionChange}
            isDisabled={!isEditable}
          >
            <SelectItem value={Permission.NoAccess}>No Access</SelectItem>
            <SelectItem value={Permission.ReadOnly}>Read Only</SelectItem>
            <SelectItem value={Permission.FullAccess}>Full Access</SelectItem>
            <SelectItem value={Permission.Custom}>Custom</SelectItem>
          </Select>
        </Td>
      </Tr>
  );
};

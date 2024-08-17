import { Control, UseFormSetValue, useWatch } from "react-hook-form";

import { Select, SelectItem, Td, Tr } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { TFormSchema } from "@app/views/Project/RolePage/components/RolePermissionsSection/ProjectRoleModifySection.utils";

type Props = {
  isEditable: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum Permission {
  SameAsSecrets = "same-as-secrets",
  ReadOnly = "read-only"
}

export const RowPermissionSecretFoldersRow = ({ isEditable, setValue, control }: Props) => {
  const formName = ProjectPermissionSub.SecretFolders;
  const rule = useWatch({
    control,
    name: `permissions.${formName}`
  });

  const selectedPermissionCategory =
    rule !== undefined ? Permission.ReadOnly : Permission.SameAsSecrets;

  const handlePermissionChange = (val: Permission) => {
    if (!val) return;
    switch (val) {
      case Permission.SameAsSecrets: {
        setValue(`permissions.${formName}`, undefined, { shouldDirty: true });
        break;
      }
      // Read-only
      default:
        setValue(
          `permissions.${formName}`,
          {
            read: true,
            edit: false,
            create: false,
            delete: false
          },
          {
            shouldDirty: true
          }
        );
        break;
    }
  };

  return (
    <Tr>
      <Td />
      <Td>Secret Folders</Td>
      <Td>
        <Select
          value={selectedPermissionCategory}
          className="w-40 bg-mineshaft-600"
          dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
          onValueChange={handlePermissionChange}
          isDisabled={!isEditable}
        >
          <SelectItem value={Permission.SameAsSecrets}>Same as Secrets</SelectItem>
          <SelectItem value={Permission.ReadOnly}>Read Only</SelectItem>
        </Select>
      </Td>
    </Tr>
  );
};

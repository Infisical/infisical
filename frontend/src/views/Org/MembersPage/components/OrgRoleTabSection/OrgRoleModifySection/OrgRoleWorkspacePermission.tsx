import { useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { faClipboardList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";

import {
  Checkbox,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";

import { TFormSchema } from "./OrgRoleModifySection.utils";

type Props = {
  isNonEditable?: boolean;
  setValue: UseFormSetValue<TFormSchema>;
  control: Control<TFormSchema>;
};

enum WorkspacePermission {
  NoAccess = "no-access",
  ReadOnly = "read-only",
  FullAccess = "full-acess",
  Custom = "custom"
}

export const OrgRoleWorkspacePermission = ({ isNonEditable, setValue, control }: Props) => {
  const { workspaces } = useWorkspace();

  const customWorkspaceRule = useWatch({
    control,
    name: "permissions.workspace.custom"
  });
  const isCustom = Boolean(customWorkspaceRule);
  const allWorkspaceRule = useWatch({ control, name: "permissions.workspace.all" });

  const selectedWsTopVal = useMemo(() => {
    const { read, delete: del, edit, create } = allWorkspaceRule || {};
    if (read && del && edit && create) return WorkspacePermission.FullAccess;
    if (read) return WorkspacePermission.ReadOnly;
    return WorkspacePermission.NoAccess;
  }, [allWorkspaceRule]);

  const handleTopLevelPermissionChange = (val: WorkspacePermission) => {
    switch (val) {
      case WorkspacePermission.NoAccess:
        setValue("permissions.workspace", {}, { shouldDirty: true });
        break;
      case WorkspacePermission.FullAccess:
        setValue(
          "permissions.workspace",
          { all: { read: true, edit: true, create: true, delete: true } },
          { shouldDirty: true }
        );
        break;
      case WorkspacePermission.ReadOnly:
        setValue(
          "permissions.workspace",
          { all: { read: true, edit: false, create: false, delete: false } },
          { shouldDirty: true }
        );
        break;
      default:
        setValue(
          "permissions.workspace",
          { custom: { read: false, edit: false, create: false, delete: false } },
          { shouldDirty: true }
        );
        break;
    }
  };

  return (
    <div className="px-10 py-6 bg-mineshaft-800 rounded-md">
      <div className="flex items-center space-x-4">
        <div>
          <FontAwesomeIcon icon={faClipboardList} className="text-4xl" />
        </div>
        <div className="flex-grow flex flex-col">
          <div className="font-medium mb-1 text-lg">Projects</div>
          <div className="text-xs font-light">User project access control</div>
        </div>
        <div>
          <Select
            defaultValue={WorkspacePermission.NoAccess}
            isDisabled={isNonEditable}
            value={isCustom ? WorkspacePermission.Custom : selectedWsTopVal}
            onValueChange={handleTopLevelPermissionChange}
          >
            <SelectItem value={WorkspacePermission.NoAccess}>No Access</SelectItem>
            <SelectItem value={WorkspacePermission.ReadOnly}>Read Only</SelectItem>
            <SelectItem value={WorkspacePermission.FullAccess}>Full Access</SelectItem>
            <SelectItem value={WorkspacePermission.Custom}>Custom</SelectItem>
          </Select>
        </div>
      </div>
      <motion.div
        initial={false}
        animate={{ height: isCustom ? "auto" : 0 }}
        className="overflow-hidden"
      >
        <TableContainer className="border-mineshaft-500 mt-6">
          <Table>
            <THead>
              <Tr>
                <Th />
                <Th className="text-center">Read</Th>
                <Th className="text-center">Create</Th>
                <Th className="text-center">Edit</Th>
                <Th className="text-center">Delete</Th>
              </Tr>
            </THead>
            <TBody>
              {isCustom &&
                workspaces?.map(({ name, _id: id }) => (
                  <Tr key={`custom-role-ws-${name}`}>
                    <Td>{name}</Td>
                    <Td>
                      <Controller
                        name={`permissions.workspace.${id}.read`}
                        control={control}
                        defaultValue={false}
                        render={({ field }) => (
                          <div className="flex items-center justify-center">
                            <Checkbox
                              isChecked={field.value}
                              onCheckedChange={field.onChange}
                              id={`permissions.workspace.${id}.read`}
                              isDisabled={isNonEditable}
                            />
                          </div>
                        )}
                      />
                    </Td>
                    <Td>
                      <Controller
                        name={`permissions.workspace.${id}.create`}
                        control={control}
                        defaultValue={false}
                        render={({ field }) => (
                          <div className="flex items-center justify-center">
                            <Checkbox
                              isChecked={field.value}
                              onCheckedChange={field.onChange}
                              onBlur={field.onBlur}
                              id={`permissions.workspace.${id}.modify`}
                              isDisabled={isNonEditable}
                            />
                          </div>
                        )}
                      />
                    </Td>
                    <Td>
                      <Controller
                        name={`permissions.workspace.${id}.edit`}
                        control={control}
                        defaultValue={false}
                        render={({ field }) => (
                          <div className="flex items-center justify-center">
                            <Checkbox
                              isChecked={field.value}
                              onCheckedChange={field.onChange}
                              onBlur={field.onBlur}
                              id={`permissions.workspace.${id}.modify`}
                              isDisabled={isNonEditable}
                            />
                          </div>
                        )}
                      />
                    </Td>
                    <Td>
                      <Controller
                        defaultValue={false}
                        name={`permissions.workspace.${id}.delete`}
                        control={control}
                        render={({ field }) => (
                          <div className="flex items-center justify-center">
                            <Checkbox
                              isChecked={field.value}
                              onCheckedChange={field.onChange}
                              id={`permissions.workspace.${id}.delete`}
                              isDisabled={isNonEditable}
                            />
                          </div>
                        )}
                      />
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </TableContainer>
      </motion.div>
    </div>
  );
};

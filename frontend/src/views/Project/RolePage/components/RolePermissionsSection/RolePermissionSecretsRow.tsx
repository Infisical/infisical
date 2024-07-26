import { useMemo } from "react";
import { Control, Controller, UseFormGetValues, UseFormSetValue, useWatch } from "react-hook-form";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import GlobPatternExamples from "@app/components/basic/popups/GlobPatternExamples";
import {
  Checkbox,
  FormControl,
  Input,
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
  const { currentWorkspace } = useWorkspace();
  const environments = currentWorkspace?.environments || [];

  const customRule = useWatch({
    control,
    name: `permissions.${formName}.custom`
  });
  const isCustom = Boolean(customRule);

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
    <>
      <Tr>
        <Td>{isCustom && <FontAwesomeIcon icon={faChevronDown} />}</Td>
        <Td>{title}</Td>
        <Td>
          <Select
            value={isCustom ? Permission.Custom : selectedPermissionCategory}
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
      {isCustom && (
        <Tr>
          <Td
            colSpan={3}
            className={`bg-bunker-600 px-0 py-0 ${isCustom && " border-mineshaft-500 p-8"}`}
          >
            <div>
              <TableContainer className="border-mineshaft-500">
                <Table>
                  <THead>
                    <Tr>
                      <Th />
                      <Th className="min-w-[8rem]">
                        <div className="flex items-center gap-2">
                          Secret Path
                          <span className="text-xs normal-case">
                            <GlobPatternExamples />
                          </span>
                        </div>
                      </Th>
                      <Th className="text-center">View</Th>
                      <Th className="text-center">Create</Th>
                      <Th className="text-center">Modify</Th>
                      <Th className="text-center">Delete</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {isCustom &&
                      environments.map(({ name, slug }) => (
                        <Tr key={`custom-role-project-secret-${slug}`}>
                          <Td>{name}</Td>
                          <Td>
                            <Controller
                              name={`permissions.${formName}.${slug}.secretPath`}
                              control={control}
                              render={({ field }) => (
                                /* eslint-disable-next-line no-template-curly-in-string */
                                <FormControl helperText="Supports glob path pattern string">
                                  <Input
                                    {...field}
                                    className="w-full overflow-ellipsis"
                                    placeholder="Glob patterns are supported"
                                  />
                                </FormControl>
                              )}
                            />
                          </Td>
                          <Td>
                            <Controller
                              name={`permissions.${formName}.${slug}.read`}
                              control={control}
                              defaultValue={false}
                              render={({ field }) => (
                                <div className="flex items-center justify-center">
                                  <Checkbox
                                    isChecked={field.value}
                                    onCheckedChange={field.onChange}
                                    id={`permissions.${formName}.${slug}.read`}
                                    isDisabled={!isEditable}
                                  />
                                </div>
                              )}
                            />
                          </Td>
                          <Td>
                            <Controller
                              name={`permissions.${formName}.${slug}.create`}
                              control={control}
                              defaultValue={false}
                              render={({ field }) => (
                                <div className="flex items-center justify-center">
                                  <Checkbox
                                    isChecked={field.value}
                                    onCheckedChange={field.onChange}
                                    onBlur={field.onBlur}
                                    id={`permissions.${formName}.${slug}.modify`}
                                    isDisabled={!isEditable}
                                  />
                                </div>
                              )}
                            />
                          </Td>
                          <Td>
                            <Controller
                              name={`permissions.${formName}.${slug}.edit`}
                              control={control}
                              defaultValue={false}
                              render={({ field }) => (
                                <div className="flex items-center justify-center">
                                  <Checkbox
                                    isChecked={field.value}
                                    onCheckedChange={field.onChange}
                                    onBlur={field.onBlur}
                                    id={`permissions.${formName}.${slug}.modify`}
                                    isDisabled={!isEditable}
                                  />
                                </div>
                              )}
                            />
                          </Td>
                          <Td>
                            <Controller
                              defaultValue={false}
                              name={`permissions.${formName}.${slug}.delete`}
                              control={control}
                              render={({ field }) => (
                                <div className="flex items-center justify-center">
                                  <Checkbox
                                    isChecked={field.value}
                                    onCheckedChange={field.onChange}
                                    id={`permissions.${formName}.${slug}.delete`}
                                    isDisabled={!isEditable}
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
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};

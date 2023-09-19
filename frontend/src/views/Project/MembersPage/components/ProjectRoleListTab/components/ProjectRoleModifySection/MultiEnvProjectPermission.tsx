import { useMemo } from "react";
import { Control, Controller, UseFormSetValue, useWatch } from "react-hook-form";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

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

import { TFormSchema } from "./ProjectRoleModifySection.utils";

type Props = {
  formName: "secrets";
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

export const MultiEnvProjectPermission = ({
  isNonEditable,
  setValue,
  control,
  formName,
  title,
  subtitle,
  icon
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
    switch (val) {
      case Permission.NoAccess:
        setValue(`permissions.${formName}`, undefined, { shouldDirty: true });
        break;
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
    <div
      className={twMerge(
        "rounded-md bg-mineshaft-800 px-10 py-6",
        (selectedPermissionCategory !== Permission.NoAccess || isCustom) &&
          "border-l-2 border-primary-600"
      )}
    >
      <div className="flex items-center space-x-4">
        <div>
          <FontAwesomeIcon icon={icon} className="text-4xl" />
        </div>
        <div className="flex flex-grow flex-col">
          <div className="mb-1 text-lg font-medium">{title}</div>
          <div className="text-xs font-light">{subtitle}</div>
        </div>
        <div>
          <Select
            defaultValue={Permission.NoAccess}
            isDisabled={isNonEditable}
            value={isCustom ? Permission.Custom : selectedPermissionCategory}
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
        animate={{ height: isCustom ? "auto" : 0 }}
        className="overflow-hidden"
      >
        <TableContainer className="mt-6 border-mineshaft-500">
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
                              isDisabled={isNonEditable}
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
                              isDisabled={isNonEditable}
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
                              isDisabled={isNonEditable}
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

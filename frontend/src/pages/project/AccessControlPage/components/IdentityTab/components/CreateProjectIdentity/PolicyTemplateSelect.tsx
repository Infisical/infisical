import { useFormContext, useWatch } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { Combobox, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  PROJECT_PERMISSION_OBJECT,
  RoleTemplates
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

import { TCreateProjectIdentityForm } from "./schema";

type TemplatePermission = { subject: ProjectPermissionSub; actions: string[] };
type TemplateOption = {
  id: string;
  name: string;
  description: string;
  permissions: TemplatePermission[];
};

const PermissionsTooltip = ({ permissions }: { permissions: TemplatePermission[] }) => (
  <div className="flex flex-col gap-2">
    {permissions
      .map((permission) => ({
        ...permission,
        object: PROJECT_PERMISSION_OBJECT[permission.subject]
      }))
      .sort((a, b) => a.object.title.localeCompare(b.object.title))
      .map(({ subject, actions, object }) => (
        <div key={subject}>
          <div className="text-xs font-medium text-label">{object.title}</div>
          <div className="text-sm">
            {actions
              .map((action) => object.actions.find((a) => a.value === action)?.label ?? action)
              .join(", ")}
          </div>
        </div>
      ))}
  </div>
);

const TemplateOptionRow = ({ option }: { option: TemplateOption }) => (
  <div className="flex flex-row items-center justify-between gap-2">
    <div className="min-w-0 flex-1">
      <p className="truncate">{option.name}</p>
      <p className="text-xs leading-4 break-words whitespace-normal text-muted">
        {option.description}
      </p>
    </div>
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="shrink-0"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <InfoIcon className="size-4 text-muted hover:text-foreground" />
      </TooltipTrigger>
      <TooltipContent side="left" align="start" className="max-w-sm">
        <PermissionsTooltip permissions={option.permissions} />
      </TooltipContent>
    </Tooltip>
  </div>
);

type Props = {
  projectType: ProjectType;
};

export const PolicyTemplateSelect = ({ projectType }: Props) => {
  const { control, setValue } = useFormContext<TCreateProjectIdentityForm>();
  const templateIds = useWatch({ control, name: "templateIds" }) ?? [];

  const options: TemplateOption[] = (
    RoleTemplates[projectType ?? ProjectType.SecretManager] ?? []
  ).map(({ id, name, description, permissions }) => ({ id, name, description, permissions }));

  if (!options.length) return null;

  const value = options.filter((option) => templateIds.includes(option.id));

  return (
    <Combobox
      multiple
      value={value}
      options={options}
      placeholder="Select additional privileges..."
      searchAriaLabel="Search additional privileges"
      getOptionValue={(option) => option.id}
      getOptionKeywords={(option) => [option.id]}
      getOptionLabel={(option) => option.name}
      renderOption={(option) => <TemplateOptionRow option={option} />}
      onValueChange={(newValue) =>
        setValue(
          "templateIds",
          newValue.map((option) => option.id),
          { shouldDirty: true }
        )
      }
    />
  );
};

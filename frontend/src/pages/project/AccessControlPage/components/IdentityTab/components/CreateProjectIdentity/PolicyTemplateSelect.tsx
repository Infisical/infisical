import { useFormContext, useWatch } from "react-hook-form";
import { components, OptionProps } from "react-select";
import { CheckIcon, InfoIcon } from "lucide-react";

import { FilterableSelect, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
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

const TemplateOptionRow = ({ isSelected, children, ...props }: OptionProps<TemplateOption>) => (
  <components.Option isSelected={isSelected} {...props}>
    <div className="flex flex-row items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate">{children}</p>
        <p className="text-xs leading-4 break-words whitespace-normal text-muted">
          {props.data.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex size-4 items-center justify-center">
          {isSelected && <CheckIcon className="size-4" />}
        </span>
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <InfoIcon className="size-4 text-muted hover:text-foreground" />
          </TooltipTrigger>
          <TooltipContent side="left" align="start" className="max-w-sm">
            <PermissionsTooltip permissions={props.data.permissions} />
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  </components.Option>
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
    <FilterableSelect
      isMulti
      value={value}
      options={options}
      placeholder="Select policy templates..."
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.name}
      components={{ Option: TemplateOptionRow }}
      onChange={(newValue) =>
        setValue(
          "templateIds",
          (newValue as TemplateOption[]).map((option) => option.id),
          { shouldDirty: true }
        )
      }
    />
  );
};

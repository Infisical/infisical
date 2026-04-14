import { useFormContext } from "react-hook-form";
import { CheckIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { ProjectPermissionSub } from "@app/context";
import { useGetWorkspaceIntegrations } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  EXCLUDED_PERMISSION_SUBS,
  PROJECT_PERMISSION_OBJECT,
  ProjectTypePermissionSubjects,
  TFormSchema
} from "./ProjectRoleModifySection.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  type: ProjectType;
  projectId?: string;
  allowedSubjects?: ProjectPermissionSub[];
  children: React.ReactNode;
  portalContainer?: HTMLElement | null;
};

const Content = ({
  projectId,
  type: projectType,
  allowedSubjects
}: {
  projectId?: string;
  type: ProjectType;
  allowedSubjects?: ProjectPermissionSub[];
}) => {
  const rootForm = useFormContext<TFormSchema>();
  const isSecretManagerProject = projectType === ProjectType.SecretManager;
  const { data: integrations = [] } = useGetWorkspaceIntegrations(projectId ?? "", {
    enabled: Boolean(isSecretManagerProject && projectId),
    refetchInterval: false
  });

  const hasNativeIntegrations = integrations.length > 0;

  const filteredPolicies = Object.entries(PROJECT_PERMISSION_OBJECT)
    .filter(
      ([subject]) =>
        ProjectTypePermissionSubjects[projectType ?? ProjectType.SecretManager][
          subject as ProjectPermissionSub
        ]
    )
    .filter(([subject]) => !EXCLUDED_PERMISSION_SUBS.includes(subject as ProjectPermissionSub))
    .filter(([subject]) => subject !== ProjectPermissionSub.Integrations || hasNativeIntegrations)
    .filter(
      ([subject]) => !allowedSubjects || allowedSubjects.includes(subject as ProjectPermissionSub)
    )
    .sort((a, b) => a[1].title.localeCompare(b[1].title))
    .map(([subject]) => subject);

  const handleSelectPolicy = (subject: string) => {
    const type = subject as ProjectPermissionSub;
    const rootPolicyValue = rootForm.getValues("permissions")?.[type];
    const hasExisting = rootPolicyValue && rootPolicyValue.length > 0;

    if (hasExisting) {
      rootForm.setValue(`permissions.${type}`, undefined as never, {
        shouldDirty: true,
        shouldTouch: true
      });
    } else {
      rootForm.setValue(
        `permissions.${type}`,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error akhilmhdh: this is because of ts collision with both
        [{}],
        { shouldDirty: true, shouldTouch: true }
      );
    }
  };

  const currentPermissions = rootForm.watch("permissions");

  return (
    <Command
      filter={(_, search, keywords) => {
        if (keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase()))) return 1;
        return 0;
      }}
    >
      <CommandInput placeholder="Search policies..." />
      <CommandList>
        <CommandEmpty>No policies found.</CommandEmpty>
        <CommandGroup>
          {filteredPolicies.map((subject) => {
            const hasPolicy = Boolean(
              currentPermissions?.[subject as ProjectPermissionSub]?.length
            );

            return (
              <CommandItem
                key={`permission-add-${subject}`}
                value={subject}
                keywords={[PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub].title]}
                onSelect={handleSelectPolicy}
              >
                <CheckIcon
                  className={cn("size-4 shrink-0", hasPolicy ? "opacity-100" : "opacity-0")}
                />
                <span>{PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub].title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export const PolicySelectionPopover = ({
  isOpen,
  onOpenChange,
  type,
  projectId,
  allowedSubjects,
  children,
  portalContainer
}: Props) => {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-0"
        container={portalContainer}
        onWheel={(e) => e.stopPropagation()}
      >
        <Content type={type} projectId={projectId} allowedSubjects={allowedSubjects} />
      </PopoverContent>
    </Popover>
  );
};

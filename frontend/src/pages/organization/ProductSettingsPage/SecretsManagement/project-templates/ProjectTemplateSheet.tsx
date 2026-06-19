import { useMemo } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { InfisicalProjectTemplate, TProjectTemplate } from "@app/hooks/api/projectTemplates";

import { EditProjectTemplate } from "./EditProjectTemplateSection/components";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectTemplate: TProjectTemplate | null;
};

export const ProjectTemplateSheet = ({ isOpen, onOpenChange, projectTemplate }: Props) => {
  const filteredTemplate = useMemo(() => {
    if (!projectTemplate) return null;

    return {
      ...projectTemplate,
      roles: projectTemplate.roles.map((role) => ({
        ...role,
        permissions: role.permissions.filter((perm) => perm.subject !== "secret-events")
      }))
    };
  }, [projectTemplate]);

  const isInfisicalTemplate = Object.values(InfisicalProjectTemplate).includes(
    projectTemplate?.name as InfisicalProjectTemplate
  );

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 overflow-auto sm:max-w-6xl">
        <SheetHeader className="border-b">
          <SheetTitle>{projectTemplate?.name ?? "Project Template"}</SheetTitle>
          <SheetDescription>
            Configure project template roles, environments, and memberships.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-auto p-6">
          {filteredTemplate && (
            <EditProjectTemplate
              isInfisicalTemplate={isInfisicalTemplate}
              projectTemplate={filteredTemplate}
              onBack={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

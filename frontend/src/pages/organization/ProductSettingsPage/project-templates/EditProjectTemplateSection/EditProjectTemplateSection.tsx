import { useMemo } from "react";

import { Empty, EmptyHeader, EmptyTitle, PageLoader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { InfisicalProjectTemplate, useListProjectTemplates } from "@app/hooks/api/projectTemplates";

import { EditProjectTemplate } from "./components";

type Props = {
  templateId: string;
  projectType: ProjectType;
};

export const EditProjectTemplateSection = ({ templateId, projectType }: Props) => {
  const { data: projectTemplates, isPending } = useListProjectTemplates();

  const projectTemplate = useMemo(() => {
    const template = projectTemplates?.find((t) => t.id === templateId && t.type === projectType);
    if (!template) return undefined;

    return {
      ...template,
      roles: template.roles.map((role) => ({
        ...role,
        permissions: role.permissions.filter((perm) => perm.subject !== "secret-events")
      }))
    };
  }, [projectTemplates, templateId, projectType]);

  const isInfisicalTemplate = Object.values(InfisicalProjectTemplate).includes(
    projectTemplate?.name as InfisicalProjectTemplate
  );

  return (
    <div>
      {/* eslint-disable-next-line no-nested-ternary */}
      {isPending ? (
        <div className="flex h-[60vh] w-full items-center justify-center p-24">
          <PageLoader />
        </div>
      ) : projectTemplate ? (
        <EditProjectTemplate
          isInfisicalTemplate={isInfisicalTemplate}
          projectTemplate={projectTemplate}
        />
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Error: Unable to find project template.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};

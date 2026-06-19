import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";

import { Button, Empty, EmptyHeader, EmptyTitle, PageLoader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { InfisicalProjectTemplate, useListProjectTemplates } from "@app/hooks/api/projectTemplates";

import { EditProjectTemplate } from "./components";

type Props = {
  templateId: string;
  onBack: () => void;
};

export const EditProjectTemplateSection = ({ templateId, onBack }: Props) => {
  const { data: projectTemplates, isPending } = useListProjectTemplates();

  const projectTemplate = useMemo(() => {
    const template = projectTemplates?.find(
      (t) => t.id === templateId && t.type === ProjectType.SecretManager
    );
    if (!template) return undefined;

    return {
      ...template,
      roles: template.roles.map((role) => ({
        ...role,
        permissions: role.permissions.filter((perm) => perm.subject !== "secret-events")
      }))
    };
  }, [projectTemplates, templateId]);

  const isInfisicalTemplate = Object.values(InfisicalProjectTemplate).includes(
    projectTemplate?.name as InfisicalProjectTemplate
  );

  return (
    <div>
      <Button
        variant="ghost"
        type="button"
        onClick={onBack}
        className="mb-6 px-0 text-mineshaft-300 hover:bg-transparent hover:text-mineshaft-100"
      >
        <ChevronLeft className="size-4" />
        Back to Templates
      </Button>
      {/* eslint-disable-next-line no-nested-ternary */}
      {isPending ? (
        <div className="flex h-[60vh] w-full items-center justify-center p-24">
          <PageLoader />
        </div>
      ) : projectTemplate ? (
        <EditProjectTemplate
          isInfisicalTemplate={isInfisicalTemplate}
          projectTemplate={projectTemplate}
          onBack={onBack}
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

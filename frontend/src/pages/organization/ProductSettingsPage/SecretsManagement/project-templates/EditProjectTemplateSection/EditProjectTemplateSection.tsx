import { ChevronLeft } from "lucide-react";

import { Button, Empty, EmptyHeader, EmptyTitle, PageLoader } from "@app/components/v3";
import {
  InfisicalProjectTemplate,
  TProjectTemplate,
  useGetProjectTemplateById
} from "@app/hooks/api/projectTemplates";

import { EditProjectTemplate } from "./components";

type Props = {
  template: TProjectTemplate;
  onBack: () => void;
};

export const EditProjectTemplateSection = ({ template, onBack }: Props) => {
  const isInfisicalTemplate = Object.values(InfisicalProjectTemplate).includes(
    template.name as InfisicalProjectTemplate
  );

  const { data: projectTemplate, isPending } = useGetProjectTemplateById(template.id, {
    initialData: template,
    enabled: !isInfisicalTemplate
  });
  const finalTemplate = isInfisicalTemplate ? template : projectTemplate;

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
      ) : finalTemplate ? (
        <EditProjectTemplate
          isInfisicalTemplate={isInfisicalTemplate}
          projectTemplate={finalTemplate}
          onBack={onBack}
        />
      ) : (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyTitle>Error: Unable to find project template.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};

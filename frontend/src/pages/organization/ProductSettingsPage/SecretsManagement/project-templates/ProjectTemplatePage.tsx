import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { EditProjectTemplateSection } from "./EditProjectTemplateSection";

type Props = {
  templateId: string;
};

export const ProjectTemplatePage = ({ templateId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const navigateBack = () => {
    if (!currentOrg?.id) return;

    navigate({
      to: "/organizations/$orgId/projects/secret-management/product-settings" as const,
      params: {
        orgId: currentOrg.id
      }
    });
  };

  return (
    <>
      <Helmet>
        <title>Project Template | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="h-full">
        <div className="mx-auto h-full w-full max-w-8xl bg-bunker-800 text-white">
          <PageHeader
            scope={ProjectType.SecretManager}
            title="Project Template"
            description="Configure project template roles, environments, and memberships."
          />
          <div className="pb-8">
            <EditProjectTemplateSection templateId={templateId} onBack={navigateBack} />
          </div>
        </div>
      </div>
    </>
  );
};

import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { AlertDescription, AlertTitle, DismissableAlert } from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";

import { ProjectTemplatesSection } from "./components";

export const ProjectTemplatesTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();

    return (
      <div className="flex flex-col gap-4">
        <DismissableAlert
          variant="info"
          actionKey="secret_management_templates_moved_banner_dismissed"
        >
          <InfoIcon />
          <AlertTitle>Secret Management Templates Have Moved</AlertTitle>
          <AlertDescription className="inline">
            Secret management templates are now defined under{" "}
            <Link
              to="/organizations/$orgId/projects/secret-management/product-settings"
              params={{ orgId: currentOrg.id }}
              className="inline underline hover:opacity-80"
            >
              Secret Management Product Settings
            </Link>
            .
          </AlertDescription>
        </DismissableAlert>
        <ProjectTemplatesSection />
      </div>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.ProjectTemplates
  }
);

import { Link } from "@tanstack/react-router";
import { InfoIcon, LayoutTemplate } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DismissableAlert
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectTitle, projectTypeToUrlSlug } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

import { OrgCertManagerTab } from "../OrgCertManagerTab";
import { OrgSecretScanningTab } from "../OrgSecretScanningTab";

const TEMPLATE_PRODUCTS = [ProjectType.KMS, ProjectType.SecretScanning, ProjectType.PAM];

export const OrgProductSettingsTab = () => {
  const { currentOrg } = useOrganization();

  return (
    <div className="flex flex-col gap-4">
      <DismissableAlert
        variant="info"
        actionKey="secrets_management_settings_moved_banner_dismissed"
      >
        <InfoIcon />
        <AlertTitle>Secrets Management Settings Have Moved</AlertTitle>
        <AlertDescription className="inline">
          Secrets management configurations now live under{" "}
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
      <OrgPermissionCan I={OrgPermissionActions.Read} a={OrgPermissionSubjects.ProjectTemplates}>
        {(isAllowed) =>
          isAllowed && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <LayoutTemplate className="size-4 text-accent" />
                  Project Templates
                </CardTitle>
                <CardDescription>
                  Project templates are managed in each product&apos;s settings.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex-wrap gap-2">
                {TEMPLATE_PRODUCTS.map((type) => (
                  <Button key={type} variant="outline" asChild>
                    <Link
                      to="/organizations/$orgId/projects/product-settings/$type"
                      params={{ orgId: currentOrg.id, type: projectTypeToUrlSlug(type) }}
                    >
                      {getProjectTitle(type)}
                    </Link>
                  </Button>
                ))}
              </CardFooter>
            </Card>
          )
        }
      </OrgPermissionCan>
      <OrgCertManagerTab />
      <OrgSecretScanningTab />
    </div>
  );
};

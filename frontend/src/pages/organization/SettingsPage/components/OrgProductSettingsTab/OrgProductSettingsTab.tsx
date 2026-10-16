import { Link } from "@tanstack/react-router";
import { LayoutTemplate } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectTitle, projectTypeToUrlSlug } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

import { OrgCertManagerTab } from "../OrgCertManagerTab";
import { OrgSecretScanningTab } from "../OrgSecretScanningTab";

const TEMPLATE_PRODUCTS = [ProjectType.SecretManager, ProjectType.KMS];

export const OrgProductSettingsTab = () => {
  const { currentOrg } = useOrganization();

  return (
    <div className="flex flex-col gap-4">
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

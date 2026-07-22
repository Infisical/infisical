import { createFileRoute, redirect } from "@tanstack/react-router";

import { urlSlugToProjectType } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ProductSettingsPage } from "./ProductSettingsPage";

const TEMPLATE_PROJECT_TYPES = new Set<ProjectType>([
  ProjectType.CertificateManager,
  ProjectType.KMS,
  ProjectType.SecretScanning,
  ProjectType.PAM,
  ProjectType.AI
]);

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/product-settings/$type/"
)({
  component: ProductSettingsPage,
  context: () => ({ breadcrumbs: [{ label: "Product Settings" }] }),
  beforeLoad: ({ params }) => {
    const projectType = urlSlugToProjectType(params.type);
    if (!projectType || !TEMPLATE_PROJECT_TYPES.has(projectType)) {
      throw redirect({
        to: "/organizations/$orgId/projects/$type",
        params: { orgId: params.orgId, type: params.type }
      });
    }
  }
});

import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamRotationByIDPage } from "./PamRotationByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/rotations/$rotationPolicyId"
)({
  component: PamRotationByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Rotation Policies",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/rotations",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Policy Details"
        }
      ]
    };
  }
});

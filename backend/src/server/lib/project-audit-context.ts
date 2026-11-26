import { requestContext } from "@fastify/request-context";

import type { TProjectAccessListener } from "@app/domains/platform/projects/ce/module";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

// Recorded on every project access resolution, nested resource checks included, so a refusal thrown later still
// names its project (audit log, permission-denied hook, error handler, API metrics).
export const recordProjectAccess: TProjectAccessListener = ({ project, grants }) => {
  requestContext.set(RequestContextKey.ProjectDetails, { id: project.id, name: project.name, slug: project.slug });
  requestContext.set(RequestContextKey.IdentityPermissionMetadata, { metadata: grants.attributeMap() });
};

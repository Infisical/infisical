import { requestContext } from "@fastify/request-context";

import type { TProjectAccessListener } from "@app/domains/platform/projects/ce/module";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

// The project a request acted in and the actor's attributes there, for the audit log, the permission-denied audit
// hook, the error handler and API metrics. Recorded whenever a user's or identity's project access is resolved,
// nested resource checks included, so a refusal thrown after that still names its project.
export const recordProjectAccess: TProjectAccessListener = ({ project, grants }) => {
  requestContext.set(RequestContextKey.ProjectDetails, { id: project.id, name: project.name, slug: project.slug });
  requestContext.set(RequestContextKey.IdentityPermissionMetadata, { metadata: grants.attributeMap() });
};

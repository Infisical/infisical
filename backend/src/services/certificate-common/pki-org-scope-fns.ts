import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TProjectDALFactory } from "@app/services/project/project-dal";

// The platform permission check answers a project in another organization with a 403, which would confirm that
// the ID exists. Call this before it so a foreign ID answers exactly like a missing one. The memo key is the one
// the permission service reads, so the project is loaded once per request.
export const assertPkiResourceInActorOrg = async ({
  projectDAL,
  projectId,
  actorOrgId,
  notFoundError
}: {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectId: string;
  actorOrgId: string;
  notFoundError: () => Error;
}) => {
  const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
    projectDAL.findById(projectId)
  );
  if (project?.orgId !== actorOrgId) throw notFoundError();
};

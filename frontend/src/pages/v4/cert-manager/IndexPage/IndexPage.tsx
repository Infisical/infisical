import { Navigate, useParams } from "@tanstack/react-router";

import { Loader } from "@app/components/v4/ui/loader";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";

export const IndexPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/cert-manager/" });
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  const access = useV4Adapter("certificates").useProjectPermission({ projectId: projectId ?? "" });

  if (isPending) return <Loader size="page" label="Loading Certificate Manager" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  if (access.isPending) return <Loader size="page" label="Loading Certificate Manager" />;

  const isAdmin = access.data?.memberships.some((membership) =>
    membership.roles.some((role) => role.role === "admin")
  );
  if (isAdmin)
    return (
      <Navigate
        replace
        to={v4Path("/organizations/$orgId/cert-manager/overview")}
        params={{ orgId }}
      />
    );
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/$")}
      params={{ orgId, _splat: "cert-manager/applications" }}
    />
  );
};

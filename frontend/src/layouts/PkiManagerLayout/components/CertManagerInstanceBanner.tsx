import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";

export const CertManagerInstanceBanner = () => {
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;
  const { currentOrg } = useOrganization();
  const { data, isPending } = useCertManagerInstanceState();

  if (isPending || !data || !data.isMultiInstance) return null;

  const activeProject = data.projects.find((p) => p.id === data.activeProjectId);
  const isViewingActive = activeProject?.id === projectId;

  const message = isViewingActive
    ? "Certificate Manager now supports one project per organization. Select the project you want to keep and migrate the rest."
    : `This project is being retired. The active Certificate Manager project is "${activeProject?.name ?? "not set"}".`;

  return (
    <div className="flex w-full flex-wrap items-center gap-x-2 border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="text-base text-yellow" />
      <span>{message}</span>
      <Link
        to="/organizations/$orgId/settings"
        params={{ orgId: currentOrg.id }}
        search={{ selectedTab: "product-settings" }}
        className="underline underline-offset-2 hover:text-yellow"
      >
        Click here.
      </Link>
    </div>
  );
};

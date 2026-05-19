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
    ? "Support for multiple Certificate Manager projects per organization is being deprecated. This is the active instance, migrate certificate authorities, policies, and profiles from secondary projects here."
    : `This Certificate Manager project is scheduled for retirement. The active instance is "${activeProject?.name ?? "not set"}", migrate your certificate authorities, policies, and profiles there to preserve them.`;

  return (
    <div className="flex w-full items-start gap-x-2 border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="mt-0.5 shrink-0 text-base text-yellow" />
      <p>
        {message}{" "}
        <Link
          to="/organizations/$orgId/settings"
          params={{ orgId: currentOrg.id }}
          search={{ selectedTab: "product-settings" }}
          className="underline underline-offset-2 hover:text-yellow"
        >
          Manage instances.
        </Link>
      </p>
    </div>
  );
};

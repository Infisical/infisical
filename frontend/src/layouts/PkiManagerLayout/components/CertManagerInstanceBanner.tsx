import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useParams } from "@tanstack/react-router";

import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";

export const CertManagerInstanceBanner = () => {
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;
  const { data, isPending } = useCertManagerInstanceState();

  if (isPending || !data || !data.isMultiInstance) return null;

  const activeProject = data.projects.find((p) => p.id === data.activeProjectId);
  const otherCount = Math.max(0, data.projects.length - 1);
  const isViewingActive = activeProject?.id === projectId;

  const message = isViewingActive
    ? `Your organization has ${otherCount} other Certificate Manager ${otherCount === 1 ? "project" : "projects"}, consolidate to a single project, multi-project Certificate Manager will be deprecated soon.`
    : `Legacy Certificate Manager instance (active is ${activeProject?.name ?? "not set"}) — consolidate to a single instance, multi-project Certificate Manager will be deprecated soon.`;

  return (
    <div className="flex w-full items-center border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="mr-2.5 text-base text-yellow" />
      <span>{message}</span>
    </div>
  );
};

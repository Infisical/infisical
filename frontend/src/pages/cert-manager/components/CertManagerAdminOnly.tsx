import { ReactNode, useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import { useProjectPermission } from "@app/context";

type Props = {
  children: ReactNode;
};

export const CertManagerAdminOnly = ({ children }: Props) => {
  const { hasProjectRole } = useProjectPermission();
  const { orgId, projectId } = useParams({ strict: false });
  const navigate = useNavigate();
  const isAdmin = hasProjectRole("admin");

  useEffect(() => {
    if (!isAdmin && orgId && projectId) {
      navigate({
        to: `/organizations/${orgId}/projects/cert-manager/${projectId}/applications` as never
      } as never);
    }
  }, [isAdmin, orgId, projectId, navigate]);

  if (!isAdmin) return null;
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
};

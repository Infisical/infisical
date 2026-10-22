import { ReactNode, useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import { useProjectPermission } from "@app/context";

type Props = {
  children: ReactNode;
};

export const CertManagerAdminOnly = ({ children }: Props) => {
  const { hasProjectRole } = useProjectPermission();
  const { orgId } = useParams({ strict: false });
  const navigate = useNavigate();
  const isAdmin = hasProjectRole("admin");

  useEffect(() => {
    if (!isAdmin && orgId) {
      navigate({
        to: "/organizations/$orgId/cert-manager/applications",
        params: { orgId }
      });
    }
  }, [isAdmin, orgId, navigate]);

  if (!isAdmin) return null;
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
};

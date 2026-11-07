import type { ReactNode } from "react";
import { AxiosError } from "axios";

import { useV4Adapter } from "../data/adapters";
import { V4ErrorPage } from "../V4ErrorPage";
import { V4NotFoundPage } from "../V4NotFoundPage";

export const ProjectGate = ({
  projectId,
  children
}: {
  projectId: string;
  children: ReactNode;
}) => {
  const { error } = useV4Adapter("access").useProject(projectId);
  const status = error instanceof AxiosError ? (error.status ?? error.response?.status) : undefined;
  if (status === 404) return <V4NotFoundPage />;
  if (status === 403 && error instanceof AxiosError)
    return <V4ErrorPage error={error} reset={() => undefined} />;
  return children;
};

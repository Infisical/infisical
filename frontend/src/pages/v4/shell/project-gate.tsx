import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react";
import { Loader } from "@infisical/cipher/ui/loader";
import { AxiosError } from "axios";

import { useV4Adapter } from "../data/adapters";
import { V4ErrorPage } from "../V4ErrorPage";
import { V4NotFoundPage } from "../V4NotFoundPage";

const GateLoader = createContext<((label: string | undefined) => void) | undefined>(undefined);

export const PageLoader = ({ label }: { label: string }) => {
  const report = useContext(GateLoader);
  useLayoutEffect(() => {
    if (!report) return undefined;
    report(label);
    return () => report(undefined);
  }, [report, label]);
  return report ? null : <Loader size="page" label={label} />;
};

export const ProjectGate = ({
  projectId,
  children
}: {
  projectId: string;
  children: ReactNode;
}) => {
  const { error, isPending } = useV4Adapter("access").useProject(projectId);
  const [pageLabel, setPageLabel] = useState<string>();
  const [handedOff, setHandedOff] = useState(false);
  useLayoutEffect(() => {
    if (!isPending) setHandedOff(true);
  }, [isPending]);
  const status = error instanceof AxiosError ? (error.status ?? error.response?.status) : undefined;
  if (status === 404) return <V4NotFoundPage />;
  if (status === 403 && error instanceof AxiosError)
    return <V4ErrorPage error={error} reset={() => undefined} />;
  return (
    <GateLoader value={setPageLabel}>
      {(!handedOff || pageLabel !== undefined) && (
        <Loader size="page" label={pageLabel ?? "Loading project"} />
      )}
      {!isPending && children}
    </GateLoader>
  );
};

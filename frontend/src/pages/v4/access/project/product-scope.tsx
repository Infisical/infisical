import type { ReactNode } from "react";
import { EmptyState } from "@infisical/cipher/ui/empty";

import { ProjectType } from "@app/hooks/api/projects/types";

import {
  CertManagerNotSetUp,
  useCertManagerProjectId
} from "../../cert-manager/components/certificate";
import { useV4Adapter } from "../../data/adapters";
import { PageLoader, ProjectGate } from "../../shell/project-gate";
import { useOrgId } from "../permissions";
import { ProductProjectScope } from "./scope";

const Scoped = ({
  projectType,
  projectId,
  isPending,
  notSetUp,
  children
}: {
  projectType: ProjectType;
  projectId?: string | null;
  isPending: boolean;
  notSetUp: ReactNode;
  children: ReactNode;
}) => {
  const orgId = useOrgId();
  if (isPending) return <PageLoader label="Loading access control" />;
  if (!projectId) return notSetUp;
  return (
    <ProductProjectScope value={{ orgId, projectId, projectType }}>
      <ProjectGate projectId={projectId}>{children}</ProjectGate>
    </ProductProjectScope>
  );
};

const CertManagerScope = ({ children }: { children: ReactNode }) => {
  const orgId = useOrgId();
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  return (
    <Scoped
      projectType={ProjectType.CertificateManager}
      projectId={projectId}
      isPending={isPending}
      notSetUp={<CertManagerNotSetUp orgId={orgId} />}
    >
      {children}
    </Scoped>
  );
};

const SecretScanningScope = ({ children }: { children: ReactNode }) => {
  const orgId = useOrgId();
  const { data, isPending } = useV4Adapter("secretScanning").useProjectId(orgId);
  return (
    <Scoped
      projectType={ProjectType.SecretScanning}
      projectId={data}
      isPending={isPending}
      notSetUp={<EmptyState icon="search" title="Secret Scanning is not set up" />}
    >
      {children}
    </Scoped>
  );
};

const PamScope = ({ children }: { children: ReactNode }) => {
  const orgId = useOrgId();
  const { data, isPending } = useV4Adapter("access").usePamProjectId(orgId);
  return (
    <Scoped
      projectType={ProjectType.PAM}
      projectId={data}
      isPending={isPending}
      notSetUp={<EmptyState icon="terminal" title="Privileged Access Manager is not set up" />}
    >
      {children}
    </Scoped>
  );
};

const scopes = {
  [ProjectType.CertificateManager]: CertManagerScope,
  [ProjectType.SecretScanning]: SecretScanningScope,
  [ProjectType.PAM]: PamScope
};

export type OrgScopedAccessProduct = keyof typeof scopes;

export const withOrgProductScope = (projectType: OrgScopedAccessProduct, Page: () => ReactNode) => {
  const Scope = scopes[projectType];
  const ScopedPage = () => (
    <Scope>
      <Page />
    </Scope>
  );
  return ScopedPage;
};

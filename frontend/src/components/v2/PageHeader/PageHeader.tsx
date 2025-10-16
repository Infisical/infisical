import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faCube, faCubes, faGlobe, faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ReactNode } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v2";
import { BadgeProps } from "@app/components/v2/Badge/Badge";
import { ProjectType } from "@app/hooks/api/projects/types";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  scope: "org" | "namespace" | "instance" | ProjectType;
};

const SCOPE_NAME: Record<NonNullable<Props["scope"]>, { label: string; icon: IconDefinition }> = {
  org: { label: "Organization", icon: faGlobe },
  [ProjectType.SecretManager]: { label: "Secrets Management", icon: faCube },
  [ProjectType.CertificateManager]: { label: "PKI", icon: faCube },
  [ProjectType.SSH]: { label: "SSH", icon: faCube },
  [ProjectType.KMS]: { label: "KMS", icon: faCube },
  [ProjectType.PAM]: { label: "PAM", icon: faCube },
  [ProjectType.SecretScanning]: { label: "Secret Scanning", icon: faCube },
  namespace: { label: "Namespace", icon: faCubes },
  instance: { label: "Server", icon: faServer }
};

const SCOPE_VARIANT: Record<NonNullable<Props["scope"]>, BadgeProps["variant"]> = {
  org: "org",
  [ProjectType.SecretManager]: "project",
  [ProjectType.CertificateManager]: "project",
  [ProjectType.SSH]: "project",
  [ProjectType.KMS]: "project",
  [ProjectType.PAM]: "project",
  [ProjectType.SecretScanning]: "project",
  namespace: "namespace",
  instance: "instance"
};

export const PageHeader = ({ title, description, children, className, scope }: Props) => (
  <div className={twMerge("mb-10 w-full", className)}>
    <div className="flex w-full justify-between">
      <div className="mr-4 flex w-full items-center">
        <h1 className="text-3xl font-medium text-white capitalize">{title}</h1>
        {scope && (
          <Badge variant={SCOPE_VARIANT[scope]} className="mt-1 ml-2.5">
            <FontAwesomeIcon icon={SCOPE_NAME[scope].icon} />
            {SCOPE_NAME[scope].label}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
    <div className="mt-2 text-gray-400">{description}</div>
  </div>
);

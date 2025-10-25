import { createElement } from "react";
import { ReactNode } from "@tanstack/react-router";
import { LucideIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  InstanceIcon,
  OrgIcon,
  ProjectIcon,
  SubOrgIcon,
  TBadgeProps
} from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  scope: "org" | "namespace" | "instance" | ProjectType | null;
};

const SCOPE_NAME: Record<NonNullable<Props["scope"]>, { label: string; icon: LucideIcon }> = {
  org: { label: "Organization", icon: OrgIcon },
  [ProjectType.SecretManager]: { label: "Project", icon: ProjectIcon },
  [ProjectType.CertificateManager]: { label: "Project", icon: ProjectIcon },
  [ProjectType.SSH]: { label: "Project", icon: ProjectIcon },
  [ProjectType.KMS]: { label: "Project", icon: ProjectIcon },
  [ProjectType.PAM]: { label: "Project", icon: ProjectIcon },
  [ProjectType.SecretScanning]: { label: "Project", icon: ProjectIcon },
  namespace: { label: "Sub-Organization", icon: SubOrgIcon },
  instance: { label: "Server", icon: InstanceIcon }
};

const SCOPE_VARIANT: Record<NonNullable<Props["scope"]>, TBadgeProps["variant"]> = {
  org: "org",
  [ProjectType.SecretManager]: "project",
  [ProjectType.CertificateManager]: "project",
  [ProjectType.SSH]: "project",
  [ProjectType.KMS]: "project",
  [ProjectType.PAM]: "project",
  [ProjectType.SecretScanning]: "project",
  namespace: "sub-org",
  instance: "neutral"
};

export const PageHeader = ({ title, description, children, className, scope }: Props) => (
  <div className={twMerge("mb-10 w-full", className)}>
    <div className="flex w-full justify-between">
      <div className="mr-4 flex w-full items-center">
        <h1 className="text-3xl font-medium text-white capitalize">{title}</h1>
        {scope && (
          <Badge variant={SCOPE_VARIANT[scope]} className="mt-1 ml-2.5">
            {createElement(SCOPE_NAME[scope].icon)}
            {SCOPE_NAME[scope].label}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
    <div className="mt-2 text-gray-400">{description}</div>
  </div>
);

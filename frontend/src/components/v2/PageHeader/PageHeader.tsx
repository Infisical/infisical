import { ReactNode } from "@tanstack/react-router";
import { LucideIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { InstanceIcon, OrgIcon, ProjectIcon, SubOrgIcon } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { createElement } from "react";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  scope: "org" | "namespace" | "instance" | ProjectType | null;
};

const SCOPE_BADGE: Record<NonNullable<Props["scope"]>, { icon: LucideIcon; className: string }> = {
  org: { className: "text-org", icon: OrgIcon },
  [ProjectType.SecretManager]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.CertificateManager]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.SSH]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.KMS]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.PAM]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.SecretScanning]: { className: "text-project", icon: ProjectIcon },
  namespace: { className: "text-sub-org", icon: SubOrgIcon },
  instance: { className: "text-neutral", icon: InstanceIcon }
};

export const PageHeader = ({ title, description, children, className, scope }: Props) => (
  <div className={twMerge("mb-10 w-full", className)}>
    <div className="flex w-full justify-between">
      <div className="mr-4 flex w-full items-center">
        <h1
          className={twMerge(
            "text-3xl font-medium text-white capitalize underline decoration-2 underline-offset-4",
            scope === "org" && "decoration-org/90",
            scope === "instance" && "decoration-neutral/90",
            scope === "namespace" && "decoration-sub-org/90",
            Object.values(ProjectType).includes((scope as ProjectType) ?? "") &&
              "decoration-project/90",
            !scope && "no-underline"
          )}
        >
          {scope &&
            createElement(SCOPE_BADGE[scope].icon, {
              size: 26,
              className: twMerge(SCOPE_BADGE[scope].className, "mr-3 mb-1 inline-block")
            })}
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
    <div className="mt-2 text-gray-400">{description}</div>
  </div>
);

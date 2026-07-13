import { createElement } from "react";
import { ReactNode } from "@tanstack/react-router";
import { LucideIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { InstanceIcon, OrgIcon, ProjectIcon, SubOrgIcon } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  scope: "org" | "namespace" | "instance" | ProjectType | null;
  icon?: LucideIcon;
};

const SCOPE_BADGE: Record<NonNullable<Props["scope"]>, { icon: LucideIcon; className: string }> = {
  org: { className: "text-org", icon: OrgIcon },
  [ProjectType.SecretManager]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.CertificateManager]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.SSH]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.KMS]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.PAM]: { className: "text-product-pam", icon: ProjectIcon },
  [ProjectType.SecretScanning]: { className: "text-project", icon: ProjectIcon },
  [ProjectType.AI]: { className: "text-project", icon: ProjectIcon },
  namespace: { className: "text-sub-org", icon: SubOrgIcon },
  instance: { className: "text-neutral", icon: InstanceIcon }
};

export const PageHeader = ({ title, description, children, className, scope, icon }: Props) => {
  const resolvedIcon = icon ?? (scope ? SCOPE_BADGE[scope].icon : null);
  const iconClassName = scope ? SCOPE_BADGE[scope].className : "";
  return (
    <div className={twMerge("mb-10 w-full", className)}>
      <div className="flex w-full justify-between">
        <div className="mr-4 flex min-w-0 flex-1 items-center">
          <h1
            className={twMerge(
              "truncate text-2xl font-medium text-white underline underline-offset-4",
              scope === "org" && "decoration-org/90",
              scope === "instance" && "decoration-neutral/90",
              scope === "namespace" && "decoration-sub-org/90",
              scope === ProjectType.PAM && "decoration-product-pam/90",
              scope !== ProjectType.PAM &&
                Object.values(ProjectType).includes((scope as ProjectType) ?? "") &&
                "decoration-project/90",
              !scope && "no-underline"
            )}
          >
            {resolvedIcon &&
              createElement(resolvedIcon, {
                size: 26,
                className: twMerge(iconClassName, "mr-3 mb-1 inline-block")
              })}
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      <div className="mt-1.5 text-mineshaft-300">{description}</div>
    </div>
  );
};

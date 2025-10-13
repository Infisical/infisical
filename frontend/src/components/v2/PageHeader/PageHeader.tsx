import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faCube, faCubes, faGlobe, faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ReactNode } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v2";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  scope: "org" | "project" | "namespace" | "instance";
};

const SCOPE_NAME: Record<NonNullable<Props["scope"]>, { label: string; icon: IconDefinition }> = {
  org: { label: "Organization", icon: faGlobe },
  project: { label: "Project", icon: faCube },
  namespace: { label: "Namespace", icon: faCubes },
  instance: { label: "Server", icon: faServer }
};

export const PageHeader = ({ title, description, children, className, scope }: Props) => (
  <div className={twMerge("mb-4 w-full", className)}>
    <div className="flex w-full justify-between">
      <div className="mr-4 flex w-full items-center">
        <h1 className="text-3xl font-medium text-white capitalize">{title}</h1>
        {scope && (
          <Badge variant={scope} className="mt-1 ml-2.5">
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

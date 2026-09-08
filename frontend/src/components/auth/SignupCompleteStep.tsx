import { SiGithub, SiYoutube } from "react-icons/si";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LayoutGrid, Users } from "lucide-react";

import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { getProjectHomePage } from "@app/helpers/project";
import { submitSignupOnboarding } from "@app/hooks/api/auth/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

import { AuthPagePanel } from "./AuthPagePanel";
import { SIGNUP_PRODUCTS, SignupProductType } from "./signupProducts";

const ORG_OVERVIEW = "organization-overview" as const;

type LaunchTarget = SignupProductType | typeof ORG_OVERVIEW;

interface SignupCompleteStepProps {
  orgId: string;
  products: SignupProductType[];
  projects: Partial<Record<SignupProductType, Project>>;
}

const COMMUNITY_LINKS: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
}[] = [
  {
    label: "Star on GitHub",
    href: "https://github.com/Infisical/infisical",
    icon: SiGithub
  },
  {
    label: "Join Community",
    href: "https://community.infisical.com/c/general/contributing/23",
    icon: Users
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@infisical_os",
    icon: SiYoutube
  }
];

export default function SignupCompleteStep({
  orgId,
  products,
  projects
}: SignupCompleteStepProps): JSX.Element {
  const selectedProducts = SIGNUP_PRODUCTS.filter((product) => products.includes(product.type));
  const destinations = [
    ...selectedProducts.map((product) => ({
      value: product.type as LaunchTarget,
      name: product.name,
      icon: product.icon,
      iconClassName: product.iconClassName
    })),
    {
      value: ORG_OVERVIEW as LaunchTarget,
      name: "Organization Overview",
      icon: LayoutGrid,
      iconClassName: "text-muted"
    }
  ];

  const getDestination = (target: LaunchTarget) => {
    if (target === ProjectType.PAM) {
      return { to: "/organizations/$orgId/pam/access" as const, params: { orgId } };
    }
    if (target !== ORG_OVERVIEW) {
      const project = projects[target];
      if (project) {
        return {
          to: getProjectHomePage(project.type, project.environments),
          params: { orgId, projectId: project.id }
        };
      }
    }
    return { to: "/organizations/$orgId/projects" as const, params: { orgId } };
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center">
      <AuthPagePanel className="gap-6">
        <CardHeader className="gap-2">
          <CardDescription className="ml-0.5 text-base">Your organization is ready</CardDescription>
          <CardTitle className="ml-0.5 font-alliance text-2xl font-normal text-foreground">
            Choose where to go next.
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <nav aria-label="Open your workspace">
            <ul className="flex flex-col gap-2">
              {destinations.map((destination) => {
                const Icon = destination.icon;
                return (
                  <li key={destination.value}>
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      isFullWidth
                      className="group h-auto min-h-10 justify-start border-border bg-card py-3 text-left whitespace-normal hover:border-border hover:bg-container-hover"
                    >
                      <Link
                        {...getDestination(destination.value)}
                        onClick={() => {
                          submitSignupOnboarding({ launchDestination: destination.value }).catch(
                            () => {}
                          );
                        }}
                      >
                        <Icon
                          aria-hidden
                          className={cn("size-4 shrink-0", destination.iconClassName)}
                        />
                        <span className="min-w-0 flex-1 pt-0.5 font-alliance text-sm font-normal">
                          {destination.name}
                        </span>
                        <ArrowRight
                          aria-hidden
                          className="size-4 shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none motion-reduce:transition-none"
                        />
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Community and resources</p>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_LINKS.map((link) => (
                <Button key={link.label} asChild variant="outline" size="sm">
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    <link.icon aria-hidden />
                    {link.label}
                  </a>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </AuthPagePanel>
    </div>
  );
}

import { useState } from "react";
import { SiGithub, SiYoutube } from "react-icons/si";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Info, LayoutGrid, Users } from "lucide-react";

import {
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { getProjectHomePage } from "@app/helpers/project";
import { submitSignupOnboarding } from "@app/hooks/api/auth/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

import { AuthPagePanel } from "./AuthPagePanel";
import { getSignupProduct, SIGNUP_PRODUCTS, SignupProductType } from "./signupProducts";

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

const ORG_OVERVIEW_CARD = {
  name: "Organization Overview",
  iconClassName: "text-project",
  tileClassName: "border-project/30 bg-gradient-to-br from-project/20 to-project/5",
  selectedCardClassName: "border-project/50 bg-project/[0.04]"
};

export default function SignupCompleteStep({
  orgId,
  products,
  projects
}: SignupCompleteStepProps): JSX.Element {
  const navigate = useNavigate();
  const selectedProducts = SIGNUP_PRODUCTS.filter((product) => products.includes(product.type));
  const isExploring = selectedProducts.length === 0;
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget>(products[0] ?? ORG_OVERVIEW);

  const title = (() => {
    if (isExploring) return "Your organization is ready";
    if (selectedProducts.length === 1) return `${selectedProducts[0].name} is set up`;
    return `${selectedProducts.length} products are set up`;
  })();

  const description = (() => {
    if (isExploring) {
      return "We'll drop you on the organization overview so you can explore all five products.";
    }
    if (selectedProducts.length === 1) return selectedProducts[0].completedDescription;
    return "Everything is ready to go.";
  })();

  const handleOpen = () => {
    submitSignupOnboarding({ launchDestination: launchTarget }).catch(() => {});

    if (launchTarget !== ORG_OVERVIEW) {
      if (launchTarget === ProjectType.PAM) {
        navigate({ to: "/organizations/$orgId/pam/access", params: { orgId } });
        return;
      }
      if (launchTarget === ProjectType.AgentVault) {
        navigate({ to: "/organizations/$orgId/agent-vault/sessions", params: { orgId } });
        return;
      }

      const project = projects[launchTarget];
      if (project) {
        navigate({
          to: getProjectHomePage(project.type, project.environments),
          params: { orgId, projectId: project.id }
        });
        return;
      }
    }

    navigate({ to: "/organizations/$orgId/projects", params: { orgId } });
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <p className="font-jetbrains-mono text-xs tracking-[0.02em] text-project uppercase">
            Organization ready
          </p>
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            {title}
          </CardTitle>
          <CardDescription className="text-sm text-label">{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isExploring ? (
            <div
              className={cn(
                "flex items-center gap-3.5 rounded-md border p-4",
                ORG_OVERVIEW_CARD.selectedCardClassName
              )}
            >
              <div
                className={cn("shrink-0 rounded-sm border p-2", ORG_OVERVIEW_CARD.tileClassName)}
              >
                <LayoutGrid className={cn("h-4.5 w-4.5", ORG_OVERVIEW_CARD.iconClassName)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{ORG_OVERVIEW_CARD.name}</p>
                <p className="mt-0.5 text-sm leading-snug text-label">
                  Your team&apos;s complete security toolkit, organized and ready when you need it.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-sm font-medium text-foreground">Where would you like to start?</p>
              <div
                role="radiogroup"
                aria-label="Launch destination"
                className="flex flex-col gap-3"
              >
                {selectedProducts.map((product) => {
                  const isSelected = launchTarget === product.type;
                  const Icon = product.icon;

                  return (
                    <button
                      key={product.type}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setLaunchTarget(product.type)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-md border bg-container/50 p-3 text-left transition-colors duration-200",
                        isSelected
                          ? product.selectedCardClassName
                          : "border-border hover:bg-container-hover/50"
                      )}
                    >
                      <div
                        className={cn("shrink-0 rounded-sm border p-1.5", product.tileClassName)}
                      >
                        <Icon className={cn("size-4", product.iconClassName)} />
                      </div>
                      <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
                        {product.name}
                      </p>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                          isSelected ? product.radioClassName : "border-muted/60"
                        )}
                      >
                        {isSelected && (
                          <span className={cn("size-2.5 rounded-full", product.dotClassName)} />
                        )}
                      </span>
                    </button>
                  );
                })}
                <div aria-hidden className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="font-jetbrains-mono text-[10px] tracking-widest text-muted uppercase">
                    or
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <button
                  type="button"
                  role="radio"
                  aria-checked={launchTarget === ORG_OVERVIEW}
                  onClick={() => setLaunchTarget(ORG_OVERVIEW)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-md border border-dashed px-4 py-3.5 text-left text-sm transition-colors duration-200",
                    launchTarget === ORG_OVERVIEW
                      ? "border-project/50 bg-project/[0.04] text-foreground"
                      : "border-border text-label hover:bg-container-hover/50 hover:text-foreground"
                  )}
                >
                  <LayoutGrid
                    className={cn(
                      "size-4 shrink-0",
                      launchTarget === ORG_OVERVIEW ? "text-project" : "text-muted"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    Start from the Organization Overview instead
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                      launchTarget === ORG_OVERVIEW ? "border-project" : "border-muted/60"
                    )}
                  >
                    {launchTarget === ORG_OVERVIEW && (
                      <span className="size-2.5 rounded-full bg-project" />
                    )}
                  </span>
                </button>
              </div>
            </div>
          )}
          {!isExploring && (
            <div className="flex items-start gap-2 text-xs text-label">
              <Info className="mt-0.5 size-3.5 shrink-0 text-muted" />
              <span>
                All five products stay available to your organization. Switch to any of them at any
                time from the{" "}
                <span className="font-medium text-foreground">Organization Overview</span>.
              </span>
            </div>
          )}
          <Separator className="my-2" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">While you&apos;re here</p>
            <p className="text-sm text-label">
              Star the repo, join the community, and keep up with releases.
            </p>
          </div>
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
          <Button variant="project" size="lg" isFullWidth onClick={handleOpen}>
            {launchTarget === ORG_OVERVIEW
              ? "Go to Organization Overview"
              : `Open ${getSignupProduct(launchTarget)?.name}`}
            <ArrowRight />
          </Button>
        </CardContent>
      </AuthPagePanel>
    </div>
  );
}

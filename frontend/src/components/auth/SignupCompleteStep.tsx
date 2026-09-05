import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Info, LayoutGrid } from "lucide-react";

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

const BrandGlyph = ({ viewBox, d }: { viewBox: string; d: string }) => (
  <svg fill="currentColor" viewBox={viewBox} aria-hidden="true">
    <path d={d} />
  </svg>
);

const COMMUNITY_LINKS = [
  {
    label: "Star on GitHub",
    href: "https://github.com/Infisical/infisical",
    viewBox: "0 0 496 512",
    d: "M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
  },
  {
    label: "Join Community",
    href: "https://community.infisical.com/c/general/contributing/23",
    viewBox: "0 0 640 512",
    d: "M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192l42.7 0c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96c-.2 0-.4 0-.7 0L21.3 320C9.6 320 0 310.4 0 298.7zM405.3 320c-.2 0-.4 0-.7 0c26.6-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7l42.7 0C592.2 192 640 239.8 640 298.7c0 11.8-9.6 21.3-21.3 21.3l-213.3 0zM224 224a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zM128 485.3C128 411.7 187.7 352 261.3 352l117.3 0C452.3 352 512 411.7 512 485.3c0 14.7-11.9 26.7-26.7 26.7l-330.7 0c-14.7 0-26.7-11.9-26.7-26.7z"
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@infisical_os",
    viewBox: "0 0 24 24",
    d: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
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
                  <BrandGlyph viewBox={link.viewBox} d={link.d} />
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

import { Helmet } from "react-helmet";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowRight, Building2, KeyRound, ServerCog } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { createNotification } from "@app/components/notifications";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { useUpdateServerConfig } from "@app/hooks/api";

type Props = {
  organizationId: string;
};

export const WelcomePage = ({ organizationId }: Props) => {
  const navigate = useNavigate();
  const router = useRouter();
  const { mutateAsync: updateServerConfig, isPending: isSkippingSetup } = useUpdateServerConfig();

  const handleContinueToOrganization = async () => {
    try {
      await updateServerConfig({ onboardingCompleted: true });
      await router.invalidate();
      await navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: organizationId }
      });
    } catch {
      createNotification({
        type: "error",
        text: "Guided setup could not be skipped. Try again."
      });
    }
  };

  return (
    <AuthPageLayout contentClassName="max-w-xl">
      <Helmet>
        <title>Instance ready | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="gap-0">
          <div className="relative mb-8 flex size-10 items-center justify-center bg-primary text-black">
            <KeyRound className="size-5" />
            <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 size-2 bg-primary" />
          </div>
          <CardTitle className="font-alliance text-3xl leading-tight font-normal">
            Your instance is ready.
          </CardTitle>
          <CardDescription className="mt-2 max-w-lg font-alliance text-base leading-relaxed">
            Choose where you want to go next:
          </CardDescription>
        </CardHeader>

        <CardContent className="mt-8 space-y-8">
          <div className="grid gap-3">
            <button
              type="button"
              disabled={isSkippingSetup}
              className="group grid min-h-18 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border border-primary/30 bg-primary/25 p-4 text-left text-foreground transition-all select-none hover:border-primary/35 hover:bg-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              onClick={() => navigate({ to: "/admin/setup" })}
            >
              <span className="min-w-0">
                <span className="flex items-start gap-2">
                  <ServerCog className="size-5 text-foreground" />
                  <span className="font-alliance text-base font-medium text-foreground">
                    Configure Server Console
                  </span>
                </span>
                <span className="block text-sm leading-relaxed text-foreground/70">
                  Set authentication, signups, encryption, and access policies.
                </span>
              </span>
              <ArrowRight className="size-4 text-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>

            <button
              type="button"
              aria-busy={isSkippingSetup}
              disabled={isSkippingSetup}
              className="group grid min-h-18 grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
              onClick={handleContinueToOrganization}
            >
              <span className="min-w-0">
                <span className="flex items-start gap-2">
                  <Building2 className="size-5 text-foreground" />
                  <span className="font-alliance text-base font-medium text-foreground">
                    Go to your organization
                  </span>
                </span>
                <span className="block text-sm leading-relaxed text-label">
                  Skip guided setup and go straight to projects, secrets, and your team.
                </span>
              </span>
              <ArrowRight className="size-4 text-label transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>
          </div>

          <p className="border-t border-border pt-6 text-xs leading-relaxed text-label">
            You can switch between the Server Console and your organization later from the global
            navigation.
          </p>
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};

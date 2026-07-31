import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, KeyRound, ServerCog } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

type Props = {
  organizationId: string;
};

export const WelcomePage = ({ organizationId }: Props) => {
  const navigate = useNavigate();

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
              className="group grid min-h-18 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border border-primary/30 bg-primary/25 p-4 text-left text-foreground transition-all select-none hover:border-primary/35 hover:bg-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              onClick={() =>
                navigate({
                  to: "/organizations/$orgId/projects",
                  params: { orgId: organizationId }
                })
              }
            >
              <span className="min-w-0">
                <span className="flex items-start gap-2">
                  <Building2 className="size-5 text-foreground" />
                  <span className="font-alliance text-base font-medium text-foreground">
                    Go to dashboard
                  </span>
                </span>
                <span className="block text-sm leading-relaxed text-foreground/70">
                  Create projects, manage secrets, and invite your team.
                </span>
              </span>
              <ArrowRight className="size-4 text-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>

            <button
              type="button"
              className="group grid min-h-18 grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
              onClick={() => navigate({ to: "/admin" })}
            >
              <span className="min-w-0">
                <span className="flex items-start gap-2">
                  <ServerCog className="size-5 text-foreground" />
                  <span className="font-alliance text-base font-medium text-foreground">
                    Open Server Console
                  </span>
                </span>
                <span className="block text-sm leading-relaxed text-label">
                  Manage authentication, signups, encryption, and instance access policies.
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

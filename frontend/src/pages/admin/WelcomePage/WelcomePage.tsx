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
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="group flex min-h-36 flex-col rounded-lg border border-primary bg-primary p-4 text-left text-black transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => navigate({ to: "/admin" })}
            >
              <ServerCog className="mb-6 size-5 text-black" />
              <span className="font-alliance text-base font-medium text-black">
                Configure Server Console
              </span>
              <span className="mt-1 py-1 text-sm leading-relaxed text-black/70">
                Set authentication, signups, encryption, and access policies.
              </span>
              <ArrowRight className="mt-auto size-4 self-end text-black/70 transition-transform group-hover:translate-x-0.5 group-hover:text-black" />
            </button>

            <button
              type="button"
              className="group flex min-h-36 flex-col rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() =>
                navigate({
                  to: "/organizations/$orgId/projects",
                  params: { orgId: organizationId }
                })
              }
            >
              <Building2 className="mb-6 size-5 text-foreground" />
              <span className="font-alliance text-base font-medium text-foreground">
                Go to your organization
              </span>
              <span className="mt-1 py-1 text-sm leading-relaxed text-label">
                Create a project, add secrets, and invite your team.
              </span>
              <ArrowRight className="mt-auto size-4 self-end text-label transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
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

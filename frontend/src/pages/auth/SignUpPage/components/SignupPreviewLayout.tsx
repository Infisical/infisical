import { ReactNode } from "react";
import { BookOpen } from "lucide-react";

import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { Button } from "@app/components/v3";

import { SignupDashboardPreview } from "./SignupDashboardPreview";

type SignupPreviewLayoutProps = {
  bottomContent?: ReactNode;
  children: ReactNode;
  headerAction?: ReactNode;
};

export const SignupPreviewLayout = ({
  bottomContent,
  children,
  headerAction
}: SignupPreviewLayoutProps) => (
  <div className="relative min-h-screen overflow-hidden bg-page">
    <SignupDashboardPreview />
    <div className="relative z-10 flex min-h-screen flex-col">
      <AuthPageHeader>
        {headerAction}
        <Button asChild variant="outline" size="sm">
          <a href="https://infisical.com/docs" target="_blank" rel="noopener noreferrer">
            <BookOpen />
            <span className="hidden sm:inline">Documentation</span>
          </a>
        </Button>
      </AuthPageHeader>
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <section className="max-h-[calc(100dvh-9rem)] thin-scrollbar w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card/95 px-6 py-7 shadow-2xl backdrop-blur-xl sm:px-8 sm:py-9">
          {children}
          {bottomContent ? (
            <div className="mt-6 border-t border-border pt-5 text-center">{bottomContent}</div>
          ) : null}
        </section>
      </main>
    </div>
  </div>
);

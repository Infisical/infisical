import { ReactNode } from "react";
import { BookOpen } from "lucide-react";

import { Button } from "@app/components/v3";

import { AuthPageBackground } from "./AuthPageBackground";
import { AuthPageFooter } from "./AuthPageFooter";
import { AuthPageHeader } from "./AuthPageHeader";

type Props = {
  bottomContent?: ReactNode;
  children: ReactNode;
  headerAction?: ReactNode;
  showFooter?: boolean;
};

export const AuthPageLayout = ({
  bottomContent,
  children,
  headerAction,
  showFooter = true
}: Props) => (
  <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(440px,44%)_minmax(0,1fr)] xl:grid-cols-[minmax(520px,40%)_minmax(0,1fr)]">
    <section className="flex min-h-screen min-w-0 flex-col bg-card px-5 sm:px-8 lg:border-r lg:border-border lg:px-10 xl:px-14">
      <AuthPageHeader>{headerAction}</AuthPageHeader>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-md [&_[data-slot=card]]:max-w-none [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:p-0 [&_[data-slot=card]]:shadow-none">
          {children}
        </div>
      </main>
      {(bottomContent || showFooter) && (
        <div className="relative z-10 pb-6 text-center">
          {bottomContent}
          {showFooter && <AuthPageFooter />}
        </div>
      )}
    </section>

    <aside className="relative hidden h-screen min-w-0 overflow-hidden bg-background lg:sticky lg:top-0 lg:flex lg:flex-col">
      <AuthPageBackground />
      <div className="relative z-10 flex h-16 items-center justify-end px-8 xl:px-12">
        <Button asChild variant="outline" size="sm">
          <a href="https://infisical.com/docs" target="_blank" rel="noopener noreferrer">
            <BookOpen />
            Documentation
          </a>
        </Button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-10 pb-16 xl:px-20">
        <div className="max-w-xl">
          <p className="mb-4 font-jetbrains-mono text-xs tracking-[0.02em] text-project uppercase">
            Trusted by 40,000+ users
          </p>
          <h2 className="font-alliance text-3xl leading-tight font-normal text-foreground xl:text-4xl">
            The <span className="text-highlight">all-in-one</span> security stack for developers and
            AI agents.
          </h2>
          <p className="mt-4 max-w-lg font-alliance text-sm leading-relaxed text-label xl:text-base">
            One place to audit every credential your apps and agents use.
          </p>
        </div>
      </div>
    </aside>
  </div>
);

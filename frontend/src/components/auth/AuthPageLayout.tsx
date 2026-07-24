import { ReactNode } from "react";
import { BookOpen } from "lucide-react";

import { Button } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { AuthPageBackground } from "./AuthPageBackground";
import { AuthPageFooter } from "./AuthPageFooter";
import { AuthPageHeader } from "./AuthPageHeader";

type Props = {
  bottomContent?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  headerAction?: ReactNode;
  showFooter?: boolean;
  variant?: "focused" | "split";
};

export const AuthPageLayout = ({
  bottomContent,
  children,
  contentClassName,
  headerAction,
  showFooter = true,
  variant = "split"
}: Props) => {
  const isSplit = variant === "split";

  return (
    <div
      className={cn(
        "min-h-screen bg-linear-to-r from-card to-bunker-900 to-75%",
        isSplit &&
          "lg:grid lg:grid-cols-[minmax(440px,44%)_minmax(0,1fr)] xl:grid-cols-[minmax(520px,40%)_minmax(0,1fr)]"
      )}
      data-variant={variant}
    >
      <section
        className={cn(
          "flex h-screen min-h-0 min-w-0 flex-col overflow-y-auto px-5 sm:px-8 lg:px-10 xl:px-14",
          isSplit && "lg:border-r lg:border-border"
        )}
      >
        <AuthPageHeader>{headerAction}</AuthPageHeader>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className={cn("w-full max-w-md", contentClassName)}>{children}</div>
        </main>
        {(bottomContent || showFooter) && (
          <div className="relative z-10 pb-6 text-center">
            {bottomContent}
            {showFooter && <AuthPageFooter />}
          </div>
        )}
      </section>

      {isSplit && (
        <aside className="relative hidden h-screen min-w-0 overflow-hidden lg:sticky lg:top-0 lg:flex lg:flex-col">
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
                Trusted by 400,000+ developers
              </p>
              <h2 className="font-alliance text-3xl leading-tight font-normal text-foreground xl:text-4xl">
                <span className="block">
                  Security <span className="text-highlight">infrastructure</span>
                </span>
                <span className="block">for developers and agents</span>
              </h2>
              <p className="mt-4 max-w-lg font-alliance text-sm leading-relaxed text-label xl:text-base">
                One place to audit every credential your apps and agents use.
              </p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

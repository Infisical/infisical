import { type ComponentType, lazy, Suspense } from "react";

import { SecretsScenarios } from "./compositions/secrets-scenarios";
import { ComparisonSlider } from "./comparison-slider";
import { PageHeading } from "./doc-parts";
import { type ComparisonPage, comparisonPages } from "./navigation";

const shots = import.meta.glob<string>("./assets/comparisons/*.webp", {
  eager: true,
  import: "default",
  query: "?url"
});
const shot = (screen: string, theme: "light" | "dark") =>
  shots[`./assets/comparisons/${screen}-${theme}.webp`];

const screens: Record<string, ComponentType> = {
  shell: lazy(() => import("./compositions/shell")),
  home: lazy(() => import("./compositions/home")),
  secrets: lazy(() => import("./compositions/secrets")),
  access: lazy(() => import("./compositions/access")),
  settings: lazy(() => import("./compositions/settings")),
  approvals: lazy(() => import("./compositions/approvals")),
  certificates: lazy(() => import("./compositions/certificates")),
  kms: lazy(() => import("./compositions/kms")),
  connections: lazy(() => import("./compositions/connections")),
  identities: lazy(() => import("./compositions/identities")),
  "audit-logs": lazy(() => import("./compositions/audit-logs")),
  "secret-scanning": lazy(() => import("./compositions/secret-scanning"))
};

export const ComparisonPageView = ({ page }: { page: ComparisonPage }) => {
  const entry = comparisonPages.find((item) => item.id === page);
  if (!entry) return null;
  const Screen = screens[entry.screen];
  const comparison = (
    <ComparisonSlider
      title={entry.title}
      before={{ light: shot(entry.screen, "light"), dark: shot(entry.screen, "dark") }}
      After={Screen}
    />
  );
  return (
    <div>
      <PageHeading title={entry.title} />
      <p
        className="text-muted-foreground mb-6 text-sm leading-6"
        style={{ maxWidth: "var(--v4-size-measure-prose)" }}
      >
        {entry.description} Before is the current app on main with seeded data, captured at 1706 by
        971. After is the live v4 page built from this design system: it follows the theme, corners
        and accent in the dock. Drag the handle or use the arrow keys, or switch to the live view to
        click through it.
      </p>
      <Suspense fallback={<p role="status">Loading the v4 page</p>}>
        {entry.screen === "secrets" ? (
          <SecretsScenarios>{comparison}</SecretsScenarios>
        ) : (
          comparison
        )}
      </Suspense>
    </div>
  );
};

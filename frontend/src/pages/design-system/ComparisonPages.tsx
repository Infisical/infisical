import { useState } from "react";

import { Select } from "@app/components/v4/ui/select";

import { accessViews } from "./access-views";
import { ComparisonSlider } from "./comparison-slider";
import { PageHeading } from "./doc-parts";
import { type ComparisonPage, comparisonPages } from "./navigation";

const shots = import.meta.glob<string>("./assets/comparisons/**/*.webp", {
  eager: true,
  import: "default",
  query: "?url"
});
const shot = (screen: string, theme: "light" | "dark") =>
  shots[`./assets/comparisons/${screen}-${theme}.webp`];
const before = (screen: string) => ({ light: shot(screen, "light"), dark: shot(screen, "dark") });

const secretsScenarios = [
  { value: "overview", label: "Overview" },
  { value: "compare", label: "Compare environments" },
  { value: "permissions", label: "Permissions" },
  { value: "loading", label: "Loading" },
  { value: "error", label: "Overview error" },
  { value: "empty", label: "Empty project" },
  { value: "no-environments", label: "No environments" },
  { value: "legacy", label: "Legacy engine" },
  { value: "large", label: "Large dataset" }
];

const SecretsComparison = ({ title, href }: { title: string; href: string }) => {
  const [scenario, setScenario] = useState("overview");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-sm">Demo data scenario</span>
        <Select
          label="Secrets scenario"
          value={scenario}
          options={secretsScenarios}
          onChange={setScenario}
        />
      </div>
      <ComparisonSlider
        title={title}
        before={before("secrets")}
        href={
          scenario === "overview"
            ? `${href}?environments=${encodeURIComponent(JSON.stringify(["dev"]))}`
            : `${href}?scenario=${scenario}`
        }
      />
    </>
  );
};

const AccessComparison = () => {
  const [viewId, setViewId] = useState(accessViews[0].value);
  const view = accessViews.find((item) => item.value === viewId) ?? accessViews[0];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-sm">Page or flow</span>
        <div style={{ width: 360 }}>
          <Select
            label="Access control page or flow"
            value={viewId}
            options={accessViews.map(({ value, label }) => ({ value, label }))}
            onChange={setViewId}
          />
        </div>
        {view.overlay && (
          <span className="text-muted-foreground text-xs">
            The v4 page can&apos;t open this from its URL. Open it from the page.
          </span>
        )}
      </div>
      <ComparisonSlider
        key={view.value}
        title={`Access control, ${view.label}`}
        before={before(`access/${view.value}`)}
        href={view.href}
      />
    </>
  );
};

export const ComparisonPageView = ({ page }: { page: ComparisonPage }) => {
  const entry = comparisonPages.find((item) => item.id === page);
  if (!entry) return null;
  return (
    <div>
      <PageHeading title={entry.title} />
      <p
        className="text-muted-foreground mb-6 text-sm leading-6"
        style={{ maxWidth: "var(--v4-size-measure-prose)" }}
      >
        {entry.description} Before is the current app on main with seeded data, captured at 1706 by
        971. After is the routed v4 demo page, following the workbench theme. Drag the handle or use
        the arrow keys, or open it live, full width, to click through it.
      </p>
      {entry.screen === "secrets" && <SecretsComparison title={entry.title} href={entry.href} />}
      {entry.screen === "access" && <AccessComparison />}
      {entry.screen !== "secrets" && entry.screen !== "access" && (
        <ComparisonSlider
          title={entry.title}
          before={before(entry.screen)}
          href={entry.href}
          start={"start" in entry ? entry.start : undefined}
        />
      )}
    </div>
  );
};

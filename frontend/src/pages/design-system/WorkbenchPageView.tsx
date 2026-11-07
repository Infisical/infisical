import { Navigate, useMatch } from "@tanstack/react-router";

import { AccentPanelButton } from "./accent-panel";
import { ComparisonPageView } from "./ComparisonPages";
import { ComponentPreviewPage } from "./ComponentPreviewPage";
import { ColorPage, SpacingShapePage, TypographyPage } from "./FoundationPages";
import { MotionPage } from "./InteractionPages";
import { type ComparisonPage, fallbackLink, routePage, workbenchPage } from "./navigation";
import { OverviewPage } from "./OverviewPage";
import { PalettePlaygroundPage } from "./PalettePlaygroundPage";
import { RulesPage } from "./RulesPage";

const WorkbenchPageView = ({ page }: { page: string }) => {
  switch (page) {
    case "overview":
      return <OverviewPage />;
    case "colors":
      return <ColorPage />;
    case "palette":
      return <PalettePlaygroundPage />;
    case "typography":
      return <TypographyPage />;
    case "spacing-shape":
      return <SpacingShapePage />;
    case "motion":
      return <MotionPage />;
    case "rules":
      return <RulesPage />;
    case "button":
      return (
        <>
          <div className="mb-4 flex justify-end">
            <AccentPanelButton />
          </div>
          <ComponentPreviewPage page={page} />
        </>
      );
    default:
      if (workbenchPage(page).category === "comparisons")
        return <ComparisonPageView page={page as ComparisonPage} />;
      return <ComponentPreviewPage page={page} />;
  }
};

export const WorkbenchRoute = () => {
  const match = useMatch({ strict: false });
  const page = routePage(match.routeId, match.params);
  if (!page) {
    const fallback = fallbackLink(
      `${match.routeId.split("/")[2]}/${(match.params as { group?: string }).group ?? ""}`
    );
    return <Navigate {...(fallback as Parameters<typeof Navigate>[0])} replace />;
  }
  return <WorkbenchPageView page={page.id} />;
};

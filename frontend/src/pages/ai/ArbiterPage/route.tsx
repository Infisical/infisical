import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ArbiterTabs } from "@app/types/project";

import { ArbiterPage } from "./ArbiterPage";

const ArbiterPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(ArbiterTabs).catch(ArbiterTabs.LiveFeed)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/arbiter"
)({
  component: ArbiterPage,
  validateSearch: zodValidator(ArbiterPageQuerySchema),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Arbiter"
        }
      ]
    };
  }
});

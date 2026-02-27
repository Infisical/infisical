import { createFileRoute } from "@tanstack/react-router";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";
import { z } from "zod";

import { InfraEditorPage } from "./InfraEditorPage";

const editorSearchSchema = z.object({
  file: z.string().optional(),
  line: z.coerce.number().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/editor"
)({
  component: InfraEditorPage,
  validateSearch: zodSearchValidator(editorSearchSchema),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [...context.breadcrumbs, { label: "Editor" }]
    };
  }
});

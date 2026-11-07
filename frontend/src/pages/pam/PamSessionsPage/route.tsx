import { createFileRoute, stripSearchParams, useSearch } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamSessionsPage } from "./PamSessionsPage";
import { PamWebRecordingPage } from "./PamWebRecordingPage";

const SessionsRoute = () => {
  const { recordingId, t } = useSearch({ strict: false }) as { recordingId?: string; t?: number };
  return recordingId ? (
    <PamWebRecordingPage sessionId={recordingId} timeMs={t ?? 0} />
  ) : (
    <PamSessionsPage />
  );
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/sessions"
)({
  component: SessionsRoute,
  validateSearch: zodValidator(
    pamSheetSearchParams.extend({
      recordingId: z.string().uuid().optional(),
      t: z.coerce.number().int().min(0).max(86400000).optional()
    })
  ),
  search: {
    middlewares: [stripSearchParams({ sessionId: undefined })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Sessions"
        }
      ]
    };
  }
});

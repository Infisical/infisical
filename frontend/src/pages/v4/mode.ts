import { isPostHogEnabled } from "@app/components/analytics/posthog";

export { isV4AppEnabled, V4_APP_FLAG } from "@app/helpers/v4AppFlag";

export const V4_DEMO_ORG_ID = "demo";

export type V4Mode = "demo" | "live";

export const canPreviewV4States = () => !isPostHogEnabled();

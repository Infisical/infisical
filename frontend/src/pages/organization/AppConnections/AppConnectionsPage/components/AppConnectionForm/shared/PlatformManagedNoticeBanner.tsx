import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";

export const PlatformManagedNoticeBanner = () => (
  <NoticeBannerV2 title="Platform Managed Credentials">
    <p className="text-sm text-bunker-300">
      This App Connection&#39;s credentials are managed by Infisical and cannot be updated.
    </p>
  </NoticeBannerV2>
);

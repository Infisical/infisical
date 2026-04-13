import { envConfig } from "@app/config/env";
import { isInfisicalCloud } from "@app/helpers/platform";

export const SidebarVersionFooter = () => {
  const version = envConfig.PLATFORM_VERSION;

  const shouldNotDisplay =
    !version ||
    isInfisicalCloud() ||
    window.location.origin.includes("http://localhost:8080") ||
    // Decicated instances don't use semver versions, but instead they use the image hash as the version
    // For this to not be confusing to users, we hide those hashes and only show semver versions
    /^[0-9a-f]{7}$/i.test(version);

  if (shouldNotDisplay) return null;

  return (
    <div className="py-2 group-data-[collapsible=icon]:hidden">
      <div className="flex w-full cursor-default items-center gap-2 px-4 py-1.5 text-xs text-muted select-none">
        <span>{`Version: ${version}`}</span>
      </div>
    </div>
  );
};

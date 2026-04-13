import { envConfig } from "@app/config/env";
import { isInfisicalCloud } from "@app/helpers/platform";

export const SidebarVersionFooter = () => {
  const version = envConfig.PLATFORM_VERSION;

  // We only display the version for on-premise instances, so we disable this
  // for cloud (US/EU instances) and also dedicated instances (they use hash versions)
  const shouldNotDisplay =
    !version ||
    isInfisicalCloud() ||
    window.location.origin.includes("http://localhost:8080") ||
    // Decicated instances don't use semver versions, we can detect them
    // by checking if the version is a 7 character hexadecimal string
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

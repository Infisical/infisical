import { envConfig } from "@app/config/env";
import { isInfisicalCloud } from "@app/helpers/platform";

export const SidebarVersionFooter = () => {
  const version = envConfig.PLATFORM_VERSION;

  const shouldNotDisplay = !version || isInfisicalCloud() || window.location.origin.includes("http://localhost:8080");

  if (shouldNotDisplay) return null;

  return (
    <div className="py-2 group-data-[collapsible=icon]:hidden">
      <div className="flex w-full cursor-default items-center gap-2 px-4 py-1.5 text-xs text-muted select-none">
        <span>{`Version: ${version}`}</span>
      </div>
    </div>
  );
};

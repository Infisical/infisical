import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { envConfig } from "@app/config/env";
import { useServerConfig } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";

export const VersionBadge = () => {
  const { config } = useServerConfig();
  const version = envConfig.PLATFORM_VERSION;

  // We only display the version for on-premise instances, so we disable this
  // for cloud (US/EU instances) and also dedicated instances (they use hash versions)
  const shouldNotDisplay =
    !version ||
    isInfisicalCloud() ||
    // Decicated instances don't use semver versions, we can detect them
    // by checking if the version is a 7 character hexadecimal string
    /^[0-9a-f]{7}$/i.test(version);

  if (shouldNotDisplay) return null;

  // only populated on self-hosted instances that are behind the latest release
  const newerVersion = config.latestAvailableVersion;

  if (!newerVersion) {
    return (
      <span className="mt-1 mr-2 hidden items-center gap-x-1.5 text-xs text-muted transition-colors hover:text-accent md:inline-flex">
        v{version}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href="https://upgrade.infisical.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 mr-2 hidden items-center gap-x-1.5 text-xs text-muted transition-colors hover:text-accent md:inline-flex"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-info" />
          New version available
        </a>
      </TooltipTrigger>
      <TooltipContent>
        v{version} → v{newerVersion}
      </TooltipContent>
    </Tooltip>
  );
};

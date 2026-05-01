import { Badge } from "@app/components/v3";
import { envConfig } from "@app/config/env";
import { isInfisicalCloud } from "@app/helpers/platform";

export const VersionBadge = () => {
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

  return (
    <Badge variant="neutral" className="mt-[3px] mr-2 hidden md:inline-flex">
      {`v${version}`}
    </Badge>
  );
};

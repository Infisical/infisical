import { UserXIcon, XIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, IconButton } from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useToggle } from "@app/hooks";

const SIGNUP_BANNER_MAX_SERVER_AGE_DAYS = 7;
const SIGNUP_BANNER_MAX_SERVER_AGE_MS = SIGNUP_BANNER_MAX_SERVER_AGE_DAYS * 24 * 60 * 60 * 1000;

type ShouldShowSignupDisabledBannerArgs = {
  allowSignUp?: boolean | null;
  createdAt?: string | Date | null;
};

const shouldShowSignupDisabledBanner = ({
  allowSignUp,
  createdAt
}: ShouldShowSignupDisabledBannerArgs): boolean => {
  if (allowSignUp !== false) return false;
  if (!createdAt) return false;

  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;

  return Date.now() - createdAtMs < SIGNUP_BANNER_MAX_SERVER_AGE_MS;
};

export const SignupDisabledBanner = () => {
  const { config } = useServerConfig();
  const [isDismissed, setIsDismissed] = useToggle(false);

  const shouldShow = shouldShowSignupDisabledBanner({
    allowSignUp: config.allowSignUp,
    createdAt: config.createdAt
  });

  if (!shouldShow || isDismissed) return null;

  return (
    <Alert variant="warning" className="relative mb-6 pr-10">
      <UserXIcon />
      <AlertTitle>Public user signups are disabled</AlertTitle>
      <AlertDescription>
        New users can only join through an organization invitation until you enable signups.{" "}
      </AlertDescription>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Dismiss banner"
        onClick={() => setIsDismissed.on()}
        className="absolute top-2 right-2 text-warning"
      >
        <XIcon />
      </IconButton>
    </Alert>
  );
};

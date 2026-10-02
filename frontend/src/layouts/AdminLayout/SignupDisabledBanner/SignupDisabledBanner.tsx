import { useServerConfig } from "@app/context";
import { useToggle } from "@app/hooks";
import { OrgAlertBanner } from "@app/layouts/OrganizationLayout/components/OrgAlertBanner";

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
    <OrgAlertBanner
      role="alert"
      onDismiss={setIsDismissed.on}
      text={
        <>
          <span className="font-medium">Public user signups are disabled</span>. New users can only
          join through an organization invitation until you enable signups.
        </>
      }
    />
  );
};

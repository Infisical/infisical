import { OrgAlertBanner } from "../OrgAlertBanner";

export const InsecureConnectionBanner = () => {
  return (
    <OrgAlertBanner
      text="Your connection to this Infisical instance is not secured via HTTPS. Some features may not
        behave as expected."
    />
  );
};

import { OrgAlertBanner } from "../OrgAlertBanner";

export const SmtpBanner = () => {
  return (
    <OrgAlertBanner
      text="Attention: SMTP has not been configured for this instance."
      link="https://infisical.com/docs/self-hosting/guides/production-hardening#smtp-security"
    />
  );
};

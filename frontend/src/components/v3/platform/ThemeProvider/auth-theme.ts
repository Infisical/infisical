export const isDarkAuthPath = (pathname: string) =>
  /^\/(?:login|signup|admin\/signup|signupinvite|requestnewinvite|email-not-verified|account-recovery|account-recovery-reset|password-setup|cli-redirect|mfa-session)(?:\/|$)/.test(
    pathname
  );

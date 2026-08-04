const linkClassName =
  "underline underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-project/45";

export const AuthTermsNotice = () => (
  <p className="text-xs text-pretty text-label">
    By signing up, you agree to our{" "}
    <a
      href="https://infisical.com/terms/cloud"
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
    >
      Terms of Service
    </a>{" "}
    and{" "}
    <a
      href="https://infisical.com/privacy"
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
    >
      Privacy Policy
    </a>
    .
  </p>
);

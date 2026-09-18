const linkClassName =
  "underline underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-project/45";

interface AuthTermsNoticeProps {
  showCaptchaNotice?: boolean;
}

export const AuthTermsNotice = ({ showCaptchaNotice = false }: AuthTermsNoticeProps) => (
  <div className="flex flex-col gap-1 text-xs text-pretty text-label">
    <p>
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
    {showCaptchaNotice && (
      <p>
        This site is protected by hCaptcha and its{" "}
        <a
          href="https://www.hcaptcha.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          Privacy Policy
        </a>{" "}
        and{" "}
        <a
          href="https://www.hcaptcha.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          Terms of Service
        </a>{" "}
        apply.
      </p>
    )}
  </div>
);

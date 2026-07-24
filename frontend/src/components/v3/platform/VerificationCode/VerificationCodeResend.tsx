import { useTranslation } from "react-i18next";

type VerificationCodeResendProps = {
  isDisabled?: boolean;
  isResending?: boolean;
  onResend: () => void | Promise<void>;
  remainingSeconds?: number;
};

export const VerificationCodeResend = ({
  isDisabled = false,
  isResending = false,
  onResend,
  remainingSeconds = 0
}: VerificationCodeResendProps) => {
  const { t } = useTranslation();
  const normalizedRemainingSeconds = Math.max(0, Math.ceil(remainingSeconds));

  let resendLabel = String(t("signup.step2-resend-submit"));
  if (isResending) {
    resendLabel = String(t("signup.step2-resend-progress"));
  } else if (normalizedRemainingSeconds > 0) {
    resendLabel = `${t("signup.step2-resend-submit")} (${normalizedRemainingSeconds}s)`;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <span className="text-label">{t("signup.step2-resend-alert")}</span>
      <button
        className="cursor-pointer text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project disabled:cursor-not-allowed disabled:text-label/60 disabled:no-underline"
        disabled={isDisabled || isResending || normalizedRemainingSeconds > 0}
        onClick={onResend}
        type="button"
      >
        {resendLabel}
      </button>
    </div>
  );
};

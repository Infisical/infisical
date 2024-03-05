/* eslint-disable react/jsx-props-no-spreading */
import { useTranslation } from "react-i18next";

interface EmailValidateStepProps {
  isValidatingEmailAndToken: boolean;
  isValidationFailed: boolean;
  resetProcess: () => void;
}

/**
 * This is the second step of sign up where users need to verify their email
 * @param {object} obj
 * @param {boolean} obj.isValidatingEmailAndToken - Is token and email verification under progress
 * @param {boolean} obj.isValidationFailed - Is token and email verification failed
 * @param {function} obj.resetProcess - If verification is failed, give user option to start from beginning
 * @returns
 */
export default function EmailValidateStep({
  isValidatingEmailAndToken,
  isValidationFailed,
  resetProcess
}: EmailValidateStepProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="mx-auto h-full w-full pb-4 md:px-8">
      <p className="text-md flex justify-center text-bunker-200">
        {isValidatingEmailAndToken && t("signup.step2-validating-token")}
        {isValidationFailed && t("signup.step2-validation-failed-title")}
      </p>
      {isValidationFailed && (
        <p className="text-md my-1 flex justify-center font-semibold text-bunker-200">
          {t("signup.step2-validation-failed-message")}{" "}
        </p>
      )}
      {isValidationFailed && (
        <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
          <div className="flex flex-row items-baseline gap-1 text-sm">
            <div className="text-md mt-2 flex flex-row text-bunker-400">
              <button onClick={resetProcess} type="button">
                <a className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                  {t("signup.step2-validation-failed-cta")}
                </a>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ChevronLeft } from "lucide-react";

import { checkIsPasswordBreached } from "@app/components/utilities/checks/password/checkIsPasswordBreached";
import {
  escapeCharRegex,
  letterCharRegex,
  lowEntropyRegexes,
  numAndSpecialCharRegex,
  repeatedCharRegex
} from "@app/components/utilities/checks/password/passwordRegexes";
import { FormControl, Input } from "@app/components/v2";
import { Button } from "@app/components/v3";
import { useResetPasswordV2 } from "@app/hooks/api";

type PasswordErrors = {
  tooShort: boolean;
  tooLong: boolean;
  noLetterChar: boolean;
  noNumOrSpecialChar: boolean;
  repeatedChar: boolean;
  escapeChar: boolean;
  lowEntropy: boolean;
  breached: boolean;
};

const validatePassword = (password: string): Omit<PasswordErrors, "breached"> => {
  return {
    tooShort: password.length < 14,
    tooLong: password.length > 100,
    noLetterChar: !letterCharRegex.test(password),
    noNumOrSpecialChar: !numAndSpecialCharRegex.test(password),
    repeatedChar: repeatedCharRegex.test(password),
    escapeChar: escapeCharRegex.test(password),
    lowEntropy: lowEntropyRegexes.some((regex) => regex.test(password))
  };
};

const hasValidationErrors = (errors: PasswordErrors): boolean => {
  return Object.values(errors).some(Boolean);
};

type Props = {
  verificationToken: string;
  onComplete: () => void;
  onBack: () => void;
};

export const EnterPasswordStep = ({ verificationToken, onComplete, onBack }: Props) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({
    tooShort: false,
    tooLong: false,
    noLetterChar: false,
    noNumOrSpecialChar: false,
    repeatedChar: false,
    escapeChar: false,
    lowEntropy: false,
    breached: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const showConfirmError = confirmPassword.length > 0 && !passwordsMatch;

  const { mutateAsync: resetPasswordV2, isPending: isLoadingV2 } = useResetPasswordV2();

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    const errors = validatePassword(value);
    setPasswordErrors((prev) => ({ ...prev, ...errors }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate and check for breached password on submit
    const errors = validatePassword(password);
    const isBreached = await checkIsPasswordBreached(password);
    const finalErrors = { ...errors, breached: isBreached };
    setPasswordErrors(finalErrors);

    if (hasValidationErrors(finalErrors) || !passwordsMatch) return;

    setIsSubmitting(true);

    try {
      await resetPasswordV2({
        newPassword: password,
        verificationToken
      });
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPasswordError = hasValidationErrors(passwordErrors);
  const isFormLoading = isSubmitting || isLoadingV2;

  const validationRules = [
    { key: "tooShort", label: "at least 14 characters", hasError: passwordErrors.tooShort },
    { key: "tooLong", label: "at most 100 characters", hasError: passwordErrors.tooLong },
    {
      key: "noLetterChar",
      label: "at least 1 letter character",
      hasError: passwordErrors.noLetterChar
    },
    {
      key: "noNumOrSpecialChar",
      label: "at least 1 number or special character",
      hasError: passwordErrors.noNumOrSpecialChar
    },
    {
      key: "repeatedChar",
      label: "at most 3 repeated, consecutive characters",
      hasError: passwordErrors.repeatedChar
    },
    {
      key: "escapeChar",
      label: "No escape characters allowed.",
      hasError: passwordErrors.escapeChar
    },
    {
      key: "lowEntropy",
      label: "Password contains personal info.",
      hasError: passwordErrors.lowEntropy
    },
    {
      key: "breached",
      label: "Password was found in a data breach.",
      hasError: passwordErrors.breached
    }
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-md flex-col items-center justify-center"
    >
      <h1 className="mb-2 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        Enter new password
      </h1>
      <p className="w-max justify-center text-center text-sm text-gray-400">
        Make sure you save it somewhere safe.
      </p>
      <FormControl
        className="mt-8 w-full"
        label="New Password"
        isRequired
        isError={isPasswordError}
      >
        <Input
          value={password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          type="password"
        />
      </FormControl>
      <FormControl
        className="w-full"
        label="Confirm Password"
        isRequired
        isError={showConfirmError}
        errorText="Passwords do not match"
      >
        <Input
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type="password"
        />
      </FormControl>
      <Button type="submit" isFullWidth isPending={isFormLoading} isDisabled={isFormLoading}>
        Change Password
      </Button>
      <div className="mt-4 w-full rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-4 drop-shadow-sm">
        <div className="mb-1 ml-2 text-sm text-gray-300">Password requirements</div>
        {validationRules.map((rule) => (
          <div key={rule.key} className="mt-2 ml-2 flex flex-row items-center justify-start">
            {rule.hasError ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div className={`${rule.hasError ? "text-gray-400" : "text-gray-600"} text-sm`}>
              {rule.label}
            </div>
          </div>
        ))}
      </div>
      <div>
        <Button variant="ghost" className="mt-6 text-mineshaft-300" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          <span className="text-sm">Back to recovery options</span>
        </Button>
      </div>
    </form>
  );
};

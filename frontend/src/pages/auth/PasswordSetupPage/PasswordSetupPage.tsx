import { FormEvent, useState } from "react";
import { faCheck, faEye, faEyeSlash, faKey, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import passwordCheck from "@app/components/utilities/checks/password/PasswordCheck";
import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useSetupPassword } from "@app/hooks/api/auth/queries";

export const PasswordSetupPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const [passwordErrorTooShort, setPasswordErrorTooShort] = useState(true);
  const [passwordErrorTooLong, setPasswordErrorTooLong] = useState(false);
  const [passwordErrorNoLetterChar, setPasswordErrorNoLetterChar] = useState(true);
  const [passwordErrorNoNumOrSpecialChar, setPasswordErrorNoNumOrSpecialChar] = useState(true);
  const [passwordErrorRepeatedChar, setPasswordErrorRepeatedChar] = useState(false);
  const [passwordErrorEscapeChar, setPasswordErrorEscapeChar] = useState(false);
  const [passwordErrorLowEntropy, setPasswordErrorLowEntropy] = useState(false);
  const [passwordErrorBreached, setPasswordErrorBreached] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const search = useSearch({ from: ROUTE_PATHS.Auth.PasswordSetupPage.id });

  const navigate = useNavigate();

  const setupPassword = useSetupPassword();

  const parsedUrl = search;
  const token = parsedUrl.token as string;
  const email = (parsedUrl.to as string)?.replace(" ", "+").trim();

  const handleSetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errorCheck = await passwordCheck({
      password,
      setPasswordErrorTooShort,
      setPasswordErrorTooLong,
      setPasswordErrorNoLetterChar,
      setPasswordErrorNoNumOrSpecialChar,
      setPasswordErrorRepeatedChar,
      setPasswordErrorEscapeChar,
      setPasswordErrorLowEntropy,
      setPasswordErrorBreached
    });

    if (password !== confirmPassword) {
      setPasswordsMatch(false);
      return;
    }

    setPasswordsMatch(true);

    if (!errorCheck) {
      try {
        await setupPassword.mutateAsync({
          email,
          token,
          password
        });

        setIsRedirecting(true);

        createNotification({
          type: "success",
          title: "Password successfully set",
          text: "Redirecting to login..."
        });

        setTimeout(() => {
          window.location.href = "/login";
        }, 3000);
      } catch {
        navigate({ to: "/personal-settings" });
      }
    }
  };

  const isInvalidPassword =
    passwordErrorTooShort ||
    passwordErrorTooLong ||
    passwordErrorNoLetterChar ||
    passwordErrorNoNumOrSpecialChar ||
    passwordErrorRepeatedChar ||
    passwordErrorEscapeChar ||
    passwordErrorLowEntropy ||
    passwordErrorBreached;

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-bunker-800">
      <form onSubmit={handleSetPassword}>
        <Card className="flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 px-8 py-4">
          <CardTitle
            className="p-0 pt-2 pb-4 text-left text-xl"
            subTitle="Make sure to store your password somewhere safe."
          >
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <FontAwesomeIcon icon={faKey} />
              </div>
              <span className="ml-2.5">Set Password</span>
            </div>
          </CardTitle>
          <FormControl label="Password">
            <Input
              value={password}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              onChange={(e) => {
                setPassword(e.target.value);
                passwordCheck({
                  password: e.target.value,
                  setPasswordErrorTooShort,
                  setPasswordErrorTooLong,
                  setPasswordErrorNoLetterChar,
                  setPasswordErrorNoNumOrSpecialChar,
                  setPasswordErrorRepeatedChar,
                  setPasswordErrorEscapeChar,
                  setPasswordErrorLowEntropy,
                  setPasswordErrorBreached
                });
              }}
              rightIcon={
                <button
                  type="button"
                  onClick={() => {
                    setShowPassword((prev) => !prev);
                  }}
                  className="cursor-pointer self-end text-gray-400"
                >
                  {showPassword ? (
                    <FontAwesomeIcon size="sm" icon={faEyeSlash} />
                  ) : (
                    <FontAwesomeIcon size="sm" icon={faEye} />
                  )}
                </button>
              }
            />
          </FormControl>
          <FormControl
            label="Confirm Password"
            errorText="Passwords must match"
            isError={!passwordsMatch}
          >
            <Input
              value={confirmPassword}
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              rightIcon={
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmPassword((prev) => !prev);
                  }}
                  className="cursor-pointer self-end text-gray-400"
                >
                  {showConfirmPassword ? (
                    <FontAwesomeIcon size="sm" icon={faEyeSlash} />
                  ) : (
                    <FontAwesomeIcon size="sm" icon={faEye} />
                  )}
                </button>
              }
            />
          </FormControl>
          <div className="mb-4 flex w-full max-w-md flex-col items-start rounded-md bg-mineshaft-700 px-2 py-2 transition-opacity duration-100">
            <div className="mb-1 text-sm text-gray-400">Password must contain:</div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorTooShort ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorTooShort ? "text-gray-400" : "text-gray-600"} text-sm`}
              >
                at least 14 characters
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorTooLong ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorTooLong ? "text-gray-400" : "text-gray-600"} text-sm`}
              >
                at most 100 characters
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorNoLetterChar ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorNoLetterChar ? "text-gray-400" : "text-gray-600"} text-sm`}
              >
                at least 1 letter character
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorNoNumOrSpecialChar ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${
                  passwordErrorNoNumOrSpecialChar ? "text-gray-400" : "text-gray-600"
                } text-sm`}
              >
                at least 1 number or special character
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorRepeatedChar ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorRepeatedChar ? "text-gray-400" : "text-gray-600"} text-sm`}
              >
                at most 3 repeated, consecutive characters
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorEscapeChar ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorEscapeChar ? "text-gray-400" : "text-gray-600"} text-sm`}
              >
                no escape characters
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorLowEntropy ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorLowEntropy ? "text-gray-400" : "text-gray-600"} text-sm`}
              >
                no personal information
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorBreached ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorBreached ? "text-gray-400" : "text-gray-600"} text-sm`}
              >
                password not found in a data breach.
              </div>
            </div>
          </div>
          <Button
            isDisabled={isInvalidPassword || setupPassword.isPending || isRedirecting}
            colorSchema="secondary"
            type="submit"
            isLoading={setupPassword.isPending}
          >
            Submit
          </Button>
        </Card>
      </form>
    </div>
  );
};

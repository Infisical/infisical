import crypto from "crypto";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faEye, faEyeSlash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import jsrp from "jsrp";
import { z } from "zod";

import passwordCheck from "@app/components/utilities/checks/password/PasswordCheck";
import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";
import { Button, FormControl, Input } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useResetPassword, useResetPasswordV2 } from "@app/hooks/api";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";

const formData = z.object({
  password: z.string(),
  passwordErrorTooShort: z.boolean().optional(),
  passwordErrorTooLong: z.boolean().optional(),
  passwordErrorNoLetterChar: z.boolean().optional(),
  passwordErrorNoNumOrSpecialChar: z.boolean().optional(),
  passwordErrorRepeatedChar: z.boolean().optional(),
  passwordErrorEscapeChar: z.boolean().optional(),
  passwordErrorLowEntropy: z.boolean().optional(),
  passwordErrorBreached: z.boolean()
});
type TFormData = z.infer<typeof formData>;

type Props = {
  verificationToken: string;
  privateKey: string;
  encryptionVersion: UserEncryptionVersion;
  onComplete: () => void;
};

export const EnterPasswordStep = ({
  verificationToken,
  encryptionVersion,
  privateKey,
  onComplete
}: Props) => {
  const search = useSearch({ from: ROUTE_PATHS.Auth.PasswordResetPage.id });
  const { to: email } = search;
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { isSubmitting }
  } = useForm<TFormData>({
    resolver: zodResolver(formData)
  });
  const { mutateAsync: resetPassword, isPending: isLoading } = useResetPassword();
  const { mutateAsync: resetPasswordV2, isPending: isLoadingV2 } = useResetPasswordV2();

  const passwordErrorTooShort = watch("passwordErrorTooShort");
  const passwordErrorTooLong = watch("passwordErrorTooLong");
  const passwordErrorNoLetterChar = watch("passwordErrorNoLetterChar");
  const passwordErrorNoNumOrSpecialChar = watch("passwordErrorNoNumOrSpecialChar");
  const passwordErrorRepeatedChar = watch("passwordErrorRepeatedChar");
  const passwordErrorEscapeChar = watch("passwordErrorEscapeChar");
  const passwordErrorLowEntropy = watch("passwordErrorLowEntropy");
  const passwordErrorBreached = watch("passwordErrorBreached");

  const isPasswordError =
    passwordErrorTooShort ||
    passwordErrorTooLong ||
    passwordErrorNoLetterChar ||
    passwordErrorNoNumOrSpecialChar ||
    passwordErrorRepeatedChar ||
    passwordErrorEscapeChar ||
    passwordErrorLowEntropy ||
    passwordErrorBreached;

  const handlePasswordCheck = async (checkPassword: string) => {
    const errorCheck = await passwordCheck({
      password: checkPassword,
      setPasswordErrorTooShort: (v) => setValue("passwordErrorTooShort", v),
      setPasswordErrorTooLong: (v) => setValue("passwordErrorTooLong", v),
      setPasswordErrorNoLetterChar: (v) => setValue("passwordErrorNoLetterChar", v),
      setPasswordErrorNoNumOrSpecialChar: (v) => setValue("passwordErrorNoNumOrSpecialChar", v),
      setPasswordErrorRepeatedChar: (v) => setValue("passwordErrorRepeatedChar", v),
      setPasswordErrorEscapeChar: (v) => setValue("passwordErrorEscapeChar", v),
      setPasswordErrorLowEntropy: (v) => setValue("passwordErrorLowEntropy", v),
      setPasswordErrorBreached: (v) => setValue("passwordErrorBreached", v)
    });

    return errorCheck;
  };

  const resetPasswordHandler = async (data: TFormData) => {
    const errorCheck = await handlePasswordCheck(data.password);

    if (errorCheck) return;

    if (encryptionVersion === UserEncryptionVersion.V2) {
      await resetPasswordV2({
        newPassword: data.password,
        verificationToken
      });
    } else {
      // eslint-disable-next-line new-cap
      const client = new jsrp.client();
      client.init(
        {
          username: email,
          password: data.password
        },
        async () => {
          client.createVerifier(async (_err: any, result: { salt: string; verifier: string }) => {
            const derivedKey = await deriveArgonKey({
              password: data.password,
              salt: result.salt,
              mem: 65536,
              time: 3,
              parallelism: 1,
              hashLen: 32
            });

            if (!derivedKey) throw new Error("Failed to derive key from password");

            const key = crypto.randomBytes(32);

            // create encrypted private key by encrypting the private
            // key with the symmetric key [key]
            const {
              ciphertext: encryptedPrivateKey,
              iv: encryptedPrivateKeyIV,
              tag: encryptedPrivateKeyTag
            } = Aes256Gcm.encrypt({
              text: privateKey,
              secret: key
            });

            // create the protected key by encrypting the symmetric key
            // [key] with the derived key
            const {
              ciphertext: protectedKey,
              iv: protectedKeyIV,
              tag: protectedKeyTag
            } = Aes256Gcm.encrypt({
              text: key.toString("hex"),
              secret: Buffer.from(derivedKey.hash)
            });

            await resetPassword({
              protectedKey,
              protectedKeyIV,
              protectedKeyTag,
              encryptedPrivateKey,
              encryptedPrivateKeyIV,
              encryptedPrivateKeyTag,
              salt: result.salt,
              verifier: result.verifier,
              verificationToken,
              password: data.password
            });
          });
        }
      );
    }
    onComplete();
  };

  return (
    <form
      onSubmit={handleSubmit(resetPasswordHandler)}
      className="mx-auto flex w-full flex-col items-center justify-center"
    >
      <h1 className="mb-2 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        Enter new password
      </h1>
      <p className="w-max justify-center text-center text-sm text-gray-400">
        Make sure you save it somewhere safe.
      </p>
      <div className="mt-8 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <FormControl
              className="w-full"
              label="New Password"
              isRequired
              isError={isPasswordError}
            >
              <Input
                {...field}
                onChange={(e) => {
                  field.onChange(e);
                  handlePasswordCheck(e.target.value);
                }}
                type={showPassword ? "text" : "password"}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => {
                      setShowPassword((prev) => !prev);
                    }}
                    className="cursor-pointer self-end text-gray-400"
                    aria-label={showPassword ? "Hide password" : "Show password"}
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
          )}
        />
      </div>
      <div className="w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          type="submit"
          size="sm"
          isFullWidth
          className="h-10"
          colorSchema="primary"
          variant="solid"
          isLoading={isSubmitting || isLoading || isLoadingV2}
          isDisabled={isSubmitting || isLoading || isLoadingV2}
        >
          Change Password
        </Button>
      </div>
      {passwordErrorTooShort ||
      passwordErrorTooLong ||
      passwordErrorNoLetterChar ||
      passwordErrorNoNumOrSpecialChar ||
      passwordErrorRepeatedChar ||
      passwordErrorEscapeChar ||
      passwordErrorLowEntropy ||
      passwordErrorBreached ? (
        <div className="mt-4 rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-4 drop-shadow-sm">
          <div className="mb-1 ml-2 text-sm text-gray-300">Password should contain:</div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorTooShort ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div className={`${passwordErrorTooShort ? "text-gray-400" : "text-gray-600"} text-sm`}>
              at least 14 characters
            </div>
          </div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorTooLong ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div className={`${passwordErrorTooLong ? "text-gray-400" : "text-gray-600"} text-sm`}>
              at most 100 characters
            </div>
          </div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorNoLetterChar ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div
              className={`${passwordErrorNoLetterChar ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              at least 1 letter character
            </div>
          </div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorNoNumOrSpecialChar ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div
              className={`${
                passwordErrorNoNumOrSpecialChar ? "text-gray-400" : "text-gray-600"
              } text-sm`}
            >
              at least 1 number or special character
            </div>
          </div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorRepeatedChar ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div
              className={`${passwordErrorRepeatedChar ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              at most 3 repeated, consecutive characters
            </div>
          </div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorEscapeChar ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div
              className={`${passwordErrorEscapeChar ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              No escape characters allowed.
            </div>
          </div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorLowEntropy ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div
              className={`${passwordErrorLowEntropy ? "text-gray-400" : "text-gray-600"} text-sm`}
            >
              Password contains personal info.
            </div>
          </div>
          <div className="ml-2 flex flex-row items-center justify-start">
            {passwordErrorBreached ? (
              <FontAwesomeIcon icon={faXmark} className="mr-2.5 text-lg text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-green" />
            )}
            <div className={`${passwordErrorBreached ? "text-gray-400" : "text-gray-600"} text-sm`}>
              Password was found in a data breach.
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
};

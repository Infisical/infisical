import crypto from "crypto";

import { Controller, useForm } from "react-hook-form";
import { faCheck, faX } from "@fortawesome/free-solid-svg-icons";
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
      className="mx-1 my-32 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 pb-3 pt-6 drop-shadow-xl md:max-w-lg md:px-6"
    >
      <p className="mx-auto flex w-max justify-center text-2xl font-semibold text-bunker-100 md:text-3xl">
        Enter new password
      </p>
      <div className="mt-1 flex flex-row items-center justify-center md:mx-2 md:pb-4">
        <p className="flex w-max max-w-md justify-center text-sm text-gray-400">
          Make sure you save it somewhere safe.
        </p>
      </div>
      <div className="mt-4 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-0 md:max-h-28 md:p-2">
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
                type="password"
              />
            </FormControl>
          )}
        />
      </div>
      {passwordErrorTooShort ||
      passwordErrorTooLong ||
      passwordErrorNoLetterChar ||
      passwordErrorNoNumOrSpecialChar ||
      passwordErrorRepeatedChar ||
      passwordErrorEscapeChar ||
      passwordErrorLowEntropy ||
      passwordErrorBreached ? (
        <div className="mx-2 mb-2 mt-3 flex w-full max-w-md flex-col items-start rounded-md bg-white/5 px-2 py-2">
          <div className="mb-1 text-sm text-gray-400">Password should contain:</div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorTooShort ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div className={`${passwordErrorTooShort ? "text-gray-400" : "text-gray-600"} text-sm`}>
              at least 14 characters
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorTooLong ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div className={`${passwordErrorTooLong ? "text-gray-400" : "text-gray-600"} text-sm`}>
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
              No escape characters allowed.
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
              Password contains personal info.
            </div>
          </div>
          <div className="ml-1 flex flex-row items-center justify-start">
            {passwordErrorBreached ? (
              <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
            )}
            <div className={`${passwordErrorBreached ? "text-gray-400" : "text-gray-600"} text-sm`}>
              Password was found in a data breach.
            </div>
          </div>
        </div>
      ) : (
        <div className="py-2" />
      )}
      <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
        <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
          <Button
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting || isLoading || isLoadingV2}
            isDisabled={isSubmitting || isLoading || isLoadingV2}
          >
            Change Password
          </Button>
        </div>
      </div>
    </form>
  );
};

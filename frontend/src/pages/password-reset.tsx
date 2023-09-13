import crypto from "crypto";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import { faCheck, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import jsrp from "jsrp";
import queryString from "query-string";

import Button from "@app/components/basic/buttons/Button";
import InputField from "@app/components/basic/InputField";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { breachedPasswordCheck, PasswordErrors,primaryPasswordCheck } from "@app/components/utilities/checks/password/checkPassword";
import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { useResetPassword, useVerifyPasswordResetCode } from "@app/hooks/api";
import { getBackupEncryptedPrivateKey } from "@app/hooks/api/auth/queries";

import { deriveArgonKey } from "../components/utilities/cryptography/crypto";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

export default function PasswordReset() {
  const [verificationToken, setVerificationToken] = useState<string>("");
  const [step, setStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [backupKey, setBackupKey] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [backupKeyError, setBackupKeyError] = useState<boolean>(false);
  const [primaryPasswordErrors, setPrimaryPasswordErrors] = useState<Omit<PasswordErrors, "breached">>({});
  const { createNotification } = useNotificationContext();

  const router = useRouter();

  const { mutateAsync: verifyPasswordResetCodeMutateAsync } = useVerifyPasswordResetCode();
  const { mutateAsync: resetPasswordMutateAsync } = useResetPassword();

  const parsedUrl = queryString.parse(router.asPath.split("?")[1]);
  const token = parsedUrl.token as string;
  const email = (parsedUrl.to as string)?.replace(" ", "+").trim();

  // Decrypt the private key with a backup key
  const getEncryptedKeyHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const result = await getBackupEncryptedPrivateKey({ verificationToken });

      setPrivateKey(
        Aes256Gcm.decrypt({
          ciphertext: result.encryptedPrivateKey,
          iv: result.iv,
          tag: result.tag,
          secret: backupKey
        })
      );
      setStep(3);
    } catch (err) {
      console.error(err);
      setBackupKeyError(true);
    }
  };

  // If everything is correct, reset the password
  const resetPasswordHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    // Remove this??? (redundant due to submit button disable if any primaryPasswordErrors?)
    // Primary password check 
    const primaryPasswordError = await primaryPasswordCheck({
      password: newPassword,
      setPrimaryPasswordErrors
    });

    if (primaryPasswordError) {
      setNewPassword("");
      setIsLoading(false);
      return;
    }

    // Secondary password check (currently the breached password API check)
    const { isBreached, errorMessage } = await breachedPasswordCheck({ password: newPassword });

    if (isBreached) {
      setNewPassword("");
      createNotification({
        text: errorMessage || "New password has previously appeared in a data breach and should never be used. Please choose a stronger password.",
        type: "error"
      });
      setIsLoading(false);
      return;
    }

    // passed all validation checks - proceed to attempt password change

    client.init(
      {
        username: email,
        password: newPassword
      },
      async () => {
        client.createVerifier(async (err: any, result: { salt: string; verifier: string }) => {
          const derivedKey = await deriveArgonKey({
            password: newPassword,
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

          await resetPasswordMutateAsync({
            protectedKey,
            protectedKeyIV,
            protectedKeyTag,
            encryptedPrivateKey,
            encryptedPrivateKeyIV,
            encryptedPrivateKeyTag,
            salt: result.salt,
            verifier: result.verifier,
            verificationToken
          });

          router.push("/login");

          setIsLoading(false);
        });
      }
    );
  };

  // Click a button to confirm email
  const stepConfirmEmail = (
    <div className="my-32 mx-1 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker py-6 px-4 drop-shadow-xl md:max-w-lg md:px-6">
      <p className="mb-8 flex justify-center bg-gradient-to-br from-sky-400 to-primary bg-clip-text text-center text-4xl font-semibold text-transparent">
        Confirm your email
      </p>
      <Image src="/images/envelope.svg" height={262} width={410} alt="verify email" />
      <div className="mx-auto mt-4 mb-2 flex max-h-24 max-w-md flex-col items-center justify-center px-4 text-lg md:p-2">
        <Button
          text="Confirm Email"
          onButtonPressed={async () => {
            try {
              const response = await verifyPasswordResetCodeMutateAsync({
                email,
                code: token
              });

              setVerificationToken(response.token);
              setStep(2);
            } catch (err) {
              console.log("ERROR", err);
              router.push("/email-not-verified");
            }
          }}
          size="lg"
        />
      </div>
    </div>
  );

  // Input backup key
  const stepInputBackupKey = (
    <form
      onSubmit={getEncryptedKeyHandler}
      className="my-32 mx-1 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 pt-6 pb-3 drop-shadow-xl md:max-w-lg md:px-6"
    >
      <p className="mx-auto mb-4 flex w-max justify-center text-2xl font-semibold text-bunker-100 md:text-3xl">
        Enter your backup key
      </p>
      <div className="mt-4 flex flex-row items-center justify-center md:mx-2 md:pb-4">
        <p className="flex w-max max-w-md justify-center text-sm text-gray-400">
          You can find it in your emergency kit. You had to download the emergency kit during
          signup.
        </p>
      </div>
      <div className="mt-4 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-0 md:max-h-28 md:p-2">
        <InputField
          label="Backup Key"
          onChangeHandler={setBackupKey}
          type="password"
          value={backupKey}
          placeholder=""
          isRequired
          error={backupKeyError}
          errorText="Something is wrong with the backup key"
        />
      </div>
      <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
        <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
          <Button type="submit" text="Submit Backup Key" onButtonPressed={() => {}} size="lg" />
        </div>
      </div>
    </form>
  );

  // Enter new password
  const stepEnterNewPassword = (
    <form
      onSubmit={resetPasswordHandler}
      className="my-32 mx-1 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 pt-6 pb-3 drop-shadow-xl md:max-w-lg md:px-6"
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
        <InputField
          label="New Password"
          onChangeHandler={async (password: string) => {
            setNewPassword(password);
            await primaryPasswordCheck({
              password,
              setPrimaryPasswordErrors
            });
          }}
          type="password"
          value={newPassword}
          isRequired
          error={Object.keys(primaryPasswordErrors).length > 0}
          autoComplete="new-password"
          id="new-password"
        />
      </div>
        {Object.keys(primaryPasswordErrors).length > 0 ? (
          <div className="mx-2 mt-3 mb-2 flex w-full max-w-md flex-col items-start rounded-md bg-white/5 px-2 py-2">
            <div className="mb-1 text-sm text-gray-400">Password should contain at least:</div>
            {Object.keys(primaryPasswordErrors).map((key) => {
              const errorMessage = primaryPasswordErrors[key as keyof Omit<PasswordErrors, "breached">];
              const errorIcon = errorMessage ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2.5 text-primary" />
              );

              return (
                <div className="ml-1 flex flex-row items-center justify-start" key={key}>
                  <div>{errorIcon}</div>
                  <p className={`text-sm ${errorMessage ? "text-gray-400" : "text-gray-600"}`}>{errorMessage}</p>
                </div>
              );
            })}
          </div>
          ): (
          <div className="py-2" />
        )}
      <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
        <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
          <Button
            type="submit"
            text="Submit New Password"
            onButtonPressed={() => setIsLoading(true)}
            size="lg"
            loading={isLoading}
          />
        </div>
      </div>
    </form>
  );

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-bunker-800">
      {step === 1 && stepConfirmEmail}
      {step === 2 && stepInputBackupKey}
      {step === 3 && stepEnterNewPassword}
    </div>
  );
}

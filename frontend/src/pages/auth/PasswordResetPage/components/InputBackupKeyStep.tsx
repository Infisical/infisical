import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { Button, FormControl, Input } from "@app/components/v2";
import { getBackupEncryptedPrivateKey } from "@app/hooks/api/auth/queries";

type Props = {
  verificationToken: string;
  onComplete: (privateKey: string) => void;
};

const formData = z.object({
  backupKey: z.string()
});
type TFormData = z.infer<typeof formData>;

export const InputBackupKeyStep = ({ verificationToken, onComplete }: Props) => {
  const { control, handleSubmit, setError } = useForm<TFormData>({
    resolver: zodResolver(formData)
  });

  const getEncryptedKeyHandler = async (data: z.infer<typeof formData>) => {
    try {
      const result = await getBackupEncryptedPrivateKey({ verificationToken });

      const privateKey = Aes256Gcm.decrypt({
        ciphertext: result.encryptedPrivateKey,
        iv: result.iv,
        tag: result.tag,
        secret: data.backupKey
      });

      onComplete(privateKey);
      // setStep(3);
    } catch (err) {
      console.error(err);
      setError("backupKey", { message: "Failed to decrypt private key" });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(getEncryptedKeyHandler)}
      className="mx-1 my-32 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker px-4 pb-3 pt-6 drop-shadow-xl md:max-w-lg md:px-6"
    >
      <p className="mx-auto mb-4 flex w-max justify-center text-2xl font-semibold text-bunker-100">
        Enter your backup key
      </p>
      <div className="mt-4 flex flex-row items-center justify-center md:mx-2 md:pb-4">
        <p className="flex w-full px-4 text-center text-sm text-gray-400 sm:max-w-md">
          You can find it in your emergency kit. You had to download the emergency kit during
          signup.
        </p>
      </div>
      <div className="mt-4 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-0 md:max-h-28 md:p-2">
        <Controller
          control={control}
          name="backupKey"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              className="w-full"
              isError={Boolean(error)}
              errorText={error?.message}
              label="Backup Key"
            >
              <Input
                className="w-full"
                value={value}
                onChange={onChange}
                placeholder="08af467b815ffa412f2c98cc3326acdb"
              />
            </FormControl>
          )}
        />
      </div>
      <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
        <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
          <Button type="submit" colorSchema="secondary">
            Submit Backup Key
          </Button>
        </div>
      </div>
    </form>
  );
};

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
      className="mx-auto flex w-full flex-col items-center justify-center"
    >
      <h1 className="mb-2 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        Enter your backup key
      </h1>
      <p className="w-max justify-center text-center text-sm text-gray-400">
        You can find it in your emergency kit you downloaded during signup.
      </p>
      <div className="mt-8 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
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
      <div className="w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          type="submit"
          size="sm"
          isFullWidth
          className="h-10"
          colorSchema="primary"
          variant="solid"
        >
          Submit Backup Key
        </Button>
      </div>
    </form>
  );
};

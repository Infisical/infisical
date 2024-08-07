import { z } from "zod";
import { Controller, useForm } from "react-hook-form";

import { faArrowRight, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button, FormControl, IconButton, Input } from "@app/components/v2";
import { fetchSecretIfPasswordIsValid } from "@app/hooks/api/secretSharing";
import { createNotification } from "@app/components/notifications";

type Props = {
  secretId: string;
  hashedHex: string;
  handleSecret: (val: any) => void;
};

const formSchema = z.object({
  password: z.string()
})

export type FormData = z.infer<typeof formSchema>;

export const PasswordContainer = ({ secretId, hashedHex, handleSecret }: Props) => {
  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onFormSubmit = async ({ password }: FormData) => {
    try {
      const secret = await fetchSecretIfPasswordIsValid(
        secretId,
        hashedHex,
        password,
      )

      if (secret) {
        handleSecret(secret);
      } else {
        createNotification({
          text: "Password is Invalid. Try again",
          type: "error"
        })
        reset();
      }
    } catch (error) {
      console.error("Failed to validate password:", error);
      createNotification({
        text: "Failed to validate password",
        type: "error"
      })
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              isRequired
              label="Password"
            >
              <div className="flex items-center gap-2 justify-between rounded-md">
                <Input {...field} placeholder="Enter Password to view secret"></Input>
                <div className="flex">
                  <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative"
                    onClick={handleSubmit(onFormSubmit)}
                  >
                    <FontAwesomeIcon 
                      className={isSubmitting ? 'fa-spin' : ''} 
                      icon={isSubmitting ? faSpinner : faArrowRight} 
                    />
                  </IconButton>
                </div>
              </div>
            </FormControl>
          )}
        />
      </form>
      <Button
        className="w-full bg-mineshaft-700 py-3 text-bunker-200"
        colorSchema="primary"
        variant="outline_bg"
        size="sm"
        onClick={() => window.open("https://app.infisical.com/share-secret", "_blank")}
        rightIcon={<FontAwesomeIcon icon={faArrowRight} className="pl-2" />}
      >
        Share your own secret
      </Button>
    </div>
  );
};

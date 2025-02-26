import { Controller, FormProvider, useForm } from "react-hook-form";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, TextArea } from "@app/components/v2";
import { useSetSecretRequestValue } from "@app/hooks/api";

const formSchema = z.object({
  secretValue: z.string().min(1)
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  onSuccess: () => void;
  secretRequestId: string;
};

export const SecretRequestContainer = ({ onSuccess, secretRequestId }: Props) => {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });

  const { mutateAsync: setSecretValue, isPending } = useSetSecretRequestValue();

  const onSubmit = async (data: FormData) => {
    await setSecretValue({
      id: secretRequestId,
      secretValue: data.secretValue
    });

    createNotification({
      title: "Secret request value shared",
      text: "The secret request value has been shared",
      type: "success"
    });

    onSuccess();
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
          <div className="flex items-center justify-between rounded-md bg-white/[0.05] p-2 text-base text-gray-400">
            <div className="w-full">
              <Controller
                control={form.control}
                name="secretValue"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                    label="Secret Value"
                  >
                    <TextArea {...field} rows={10} reSize="none" />
                  </FormControl>
                )}
              />
              <Button
                isLoading={isPending}
                isDisabled={isPending}
                colorSchema="secondary"
                className="w-full"
                type="submit"
              >
                Share Secret
                <FontAwesomeIcon className="ml-2" icon={faArrowRight} />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

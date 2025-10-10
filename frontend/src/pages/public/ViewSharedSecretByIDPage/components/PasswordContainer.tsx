import { Controller, useForm } from "react-hook-form";
import { faArrowRight, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, IconButton, Input } from "@app/components/v2";

type Props = {
  onPasswordSubmit: (val: any) => void;
  isSubmitting?: boolean;
  isInvalidCredential?: boolean;
};

const formSchema = z.object({
  password: z.string()
});

export type FormData = z.infer<typeof formSchema>;

export const PasswordContainer = ({
  onPasswordSubmit,
  isSubmitting,
  isInvalidCredential
}: Props) => {
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });

  const onFormSubmit = async ({ password }: FormData) => {
    onPasswordSubmit(password);
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Controller
          control={control}
          name="password"
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error) || isInvalidCredential}
              errorText={isInvalidCredential ? "Invalid credential" : error?.message}
              isRequired
              label="Password"
            >
              <div className="flex items-center justify-between gap-2 rounded-md">
                <Input {...field} placeholder="Enter Password to view secret" type="password" />
                <div className="flex">
                  <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative"
                    onClick={handleSubmit(onFormSubmit)}
                  >
                    <FontAwesomeIcon
                      className={isSubmitting ? "fa-spin" : ""}
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
        onClick={() => window.open("/share-secret", "_blank", "noopener")}
        rightIcon={<FontAwesomeIcon icon={faArrowRight} className="pl-2" />}
      >
        Share Your Own Secret
      </Button>
    </div>
  );
};

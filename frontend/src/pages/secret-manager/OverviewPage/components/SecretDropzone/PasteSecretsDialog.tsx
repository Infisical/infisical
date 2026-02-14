import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { parseDotEnv, parseJson } from "@app/components/utilities/parseSecrets";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  TextArea
} from "@app/components/v3";
import { Field, FieldContent, FieldError, FieldLabel } from "@app/components/v3/generic/Field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onParsedSecrets: (env: TParsedEnv) => void;
};

const formSchema = z.object({
  value: z.string().trim()
});

type TForm = z.infer<typeof formSchema>;

type ContentProps = {
  onParsedSecrets: (env: TParsedEnv) => void;
  onClose: () => void;
};

const PasteSecretsContent = ({ onParsedSecrets, onClose }: ContentProps) => {
  const {
    handleSubmit,
    register,
    formState: { isDirty, errors },
    setError,
    setFocus,
    reset
  } = useForm<TForm>({ defaultValues: { value: "" }, resolver: zodResolver(formSchema) });

  const onSubmit = ({ value }: TForm) => {
    let env: TParsedEnv;
    try {
      env = parseJson(value);
    } catch {
      env = parseDotEnv(value);
    }

    if (!Object.keys(env).length) {
      setError("value", {
        message: "No secrets found. Please make sure the provided format is valid."
      });
      setFocus("value");
      return;
    }

    reset();
    onClose();
    onParsedSecrets(env);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Paste Secret Values</DialogTitle>
        <DialogDescription>Paste values in .env, .json or .yml format</DialogDescription>
      </DialogHeader>
      <form className="flex min-w-0 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <Field>
          <FieldLabel>
            Secret Values
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-3 text-muted" />
              </TooltipTrigger>
              <TooltipContent className="max-w-lg py-3 whitespace-pre-line">
                <div className="flex flex-col gap-2">
                  <p>Example Formats:</p>
                  <pre className="rounded-md bg-container p-3 text-xs">
                    {/* eslint-disable-next-line react/jsx-no-comment-textnodes */}
                    <p className="text-mineshaft-400">// .json</p>
                    {JSON.stringify(
                      {
                        APP_NAME: "example-service",
                        APP_VERSION: "1.2.3",
                        NODE_ENV: "production"
                      },
                      null,
                      2
                    )}
                  </pre>
                  <pre className="rounded-md bg-container p-3 text-xs">
                    <p className="text-mineshaft-400"># .env</p>
                    <p>APP_NAME=&quot;example-service&quot;</p>
                    <p>APP_VERSION=&quot;1.2.3&quot;</p>
                    <p>NODE_ENV=&quot;production&quot;</p>
                  </pre>
                  <pre className="rounded-md bg-container p-3 text-xs">
                    <p className="text-mineshaft-400"># .yml</p>
                    <p>APP_NAME: example-service</p>
                    <p>APP_VERSION: 1.2.3</p>
                    <p>NODE_ENV: production</p>
                  </pre>
                </div>
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <FieldContent>
            <TextArea
              {...register("value")}
              placeholder="Paste secrets in .json, .yml or .env format..."
              className="h-[60vh] resize-none!"
            />
            <FieldError errors={[errors.value]} />
          </FieldContent>
        </Field>
        <Button className="mt-4 ml-auto" variant="project" isDisabled={!isDirty} type="submit">
          Parse Secrets
        </Button>
      </form>
    </>
  );
};

export const PasteSecretsDialog = ({ isOpen, onOpenChange, onParsedSecrets }: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <PasteSecretsContent
          onParsedSecrets={onParsedSecrets}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

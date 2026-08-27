import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { parseDotEnv, parseJson } from "@app/components/utilities/parseSecrets";
import { TextArea } from "@app/components/v3";
import { Field, FieldContent, FieldError, FieldLabel } from "@app/components/v3/generic/Field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3/generic/Tooltip";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

const formSchema = z.object({
  value: z.string().trim()
});

type TForm = z.infer<typeof formSchema>;

type ContentProps = {
  onParsedSecrets: (env: TParsedEnv) => void;
  onDirtyChange?: (isDirty: boolean) => void;
};

export const PASTE_SECRETS_FORM_ID = "paste-secrets-form";

export const PasteSecretsContent = ({ onParsedSecrets, onDirtyChange }: ContentProps) => {
  const {
    handleSubmit,
    register,
    formState: { isDirty, errors },
    setError,
    setFocus,
    reset
  } = useForm<TForm>({ defaultValues: { value: "" }, resolver: zodResolver(formSchema) });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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
    onParsedSecrets(env);
  };

  return (
    <form
      id={PASTE_SECRETS_FORM_ID}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit(onSubmit)}
    >
      <Field>
        <FieldLabel>
          Secret Values
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="size-3 text-muted" />
            </TooltipTrigger>
            <TooltipContent className="max-w-lg py-3 whitespace-pre-line">
              <div className="flex flex-col gap-2">
                <div>
                  <p>Example Formats:</p>
                  <p className="text-xs text-muted">
                    Each entry&apos;s key becomes the secret name and its value becomes the secret
                    value.
                  </p>
                </div>
                <pre className="rounded-md bg-container p-3 text-xs">
                  {/* eslint-disable-next-line react/jsx-no-comment-textnodes */}
                  <p className="text-muted">// .json — {"{ <secret-name>: <secret-value> }"}</p>
                  {JSON.stringify(
                    {
                      DATABASE_URL: "postgres://user:pass@host:5432/db",
                      API_KEY: "sk_live_abc123",
                      NODE_ENV: "production"
                    },
                    null,
                    2
                  )}
                </pre>
                <pre className="rounded-md bg-container p-3 text-xs">
                  <p className="text-muted"># .env</p>
                  <p>APP_NAME=&quot;example-service&quot;</p>
                  <p>APP_VERSION=&quot;1.2.3&quot;</p>
                  <p>NODE_ENV=&quot;production&quot;</p>
                </pre>
                <pre className="rounded-md bg-container p-3 text-xs">
                  <p className="text-muted"># .yml</p>
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
    </form>
  );
};

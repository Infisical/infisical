import { useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faInfoCircle, faPaste } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { parseDotEnv, parseJson } from "@app/components/utilities/parseSecrets";
import { Button, CodeEditor, FormControl, Modal, ModalContent, ModalTrigger } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

type Props = {
  isOpen?: boolean;
  isSmaller?: boolean;
  onToggle: (isOpen: boolean) => void;
  onParsedEnv: (env: Record<string, { value: string; comments: string[] }>) => void;
  environment: string;
  secretPath: string;
};

const formSchema = z.object({
  value: z.string().trim()
});

type TForm = z.infer<typeof formSchema>;

const PasteEnvForm = ({ onParsedEnv }: Pick<Props, "onParsedEnv">) => {
  const [editorValue, setEditorValue] = useState("");

  const {
    handleSubmit,
    formState: { errors },
    setError,
    setValue,
    watch
  } = useForm<TForm>({
    defaultValues: { value: "" },
    resolver: zodResolver(formSchema)
  });

  const formValue = watch("value");

  // Sync editor with form
  useEffect(() => {
    if (editorValue !== formValue) {
      setValue("value", editorValue, { shouldValidate: true });
    }
  }, [editorValue, setValue, formValue]);

  const onSubmit = ({ value }: TForm) => {
    let env: Record<string, { value: string; comments: string[] }>;
    try {
      env = parseJson(value);
    } catch {
      // not json, parse as env
      env = parseDotEnv(value);
    }

    if (!Object.keys(env).length) {
      setError("value", {
        message: "No secrets found. Please make sure the provided format is valid."
      });
      return;
    }

    onParsedEnv(env);
  };

  const isDirty = editorValue.trim().length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormControl
        label="Secret Values"
        isError={Boolean(errors.value)}
        errorText={errors.value?.message}
        icon={<FontAwesomeIcon size="sm" className="text-mineshaft-400" icon={faInfoCircle} />}
        tooltipClassName="max-w-lg px-2 whitespace-pre-line"
        tooltipText={
          <div className="flex flex-col gap-2">
            <p>Example Formats:</p>
            <pre className="rounded-md bg-mineshaft-900 p-3 text-xs">
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
            <pre className="rounded-md bg-mineshaft-900 p-3 text-xs">
              <p className="text-mineshaft-400"># .env</p>
              <p>APP_NAME=&quot;example-service&quot;</p>
              <p>APP_VERSION=&quot;1.2.3&quot;</p>
              <p>NODE_ENV=&quot;production&quot;</p>
            </pre>
            <pre className="rounded-md bg-mineshaft-900 p-3 text-xs">
              <p className="text-mineshaft-400"># .yml</p>
              <p>APP_NAME: example-service</p>
              <p>APP_VERSION: 1.2.3</p>
              <p>NODE_ENV: production</p>
            </pre>
          </div>
        }
      >
        <CodeEditor
          value={editorValue}
          onChange={setEditorValue}
          placeholder="Paste your secrets here... (JSON, YAML, or ENV format)"
        />
      </FormControl>
      <Button isDisabled={!isDirty} type="submit">
        Import Secrets
      </Button>
    </form>
  );
};

export const PasteSecretEnvModal = ({
  isSmaller,
  isOpen,
  onParsedEnv,
  onToggle,
  environment,
  secretPath
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalTrigger asChild>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: "*",
              secretTags: ["*"]
            })}
          >
            {(isAllowed) => (
              <Button
                leftIcon={<FontAwesomeIcon icon={faPaste} />}
                onClick={() => onToggle(true)}
                isDisabled={!isAllowed}
                variant="star"
                size={isSmaller ? "xs" : "sm"}
              >
                Paste Secrets
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </ModalTrigger>
      <ModalContent
        className="max-w-2xl"
        title="Past Secret Values"
        subTitle="Paste values in .env, .json or .yml format"
      >
        <PasteEnvForm
          onParsedEnv={(value) => {
            onToggle(false);
            onParsedEnv(value);
          }}
        />
      </ModalContent>
    </Modal>
  );
};

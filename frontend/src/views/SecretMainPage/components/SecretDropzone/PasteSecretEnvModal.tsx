import { useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faPaste } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { ProjectPermissionCan } from "@app/components/permissions";
import { parseDotEnv, parseJson } from "@app/components/utilities/parseSecrets";
import {
  Button,
  FormControl,
  Modal,
  ModalContent,
  ModalTrigger,
  TextArea
} from "@app/components/v2";
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
  const {
    handleSubmit,
    register,
    formState: { isDirty, errors },
    setError,
    setFocus
  } = useForm<TForm>({ defaultValues: { value: "" }, resolver: zodResolver(formSchema) });

  const onSubmit = ({ value }: TForm) => {
    let env: Record<string, { value: string; comments: string[] }>;
    try {
      env = parseJson(value);
    } catch (e) {
      // not json, parse as env
      env = parseDotEnv(value);
    }

    if (!Object.keys(env).length) {
      setError("value", {
        message: "No secrets found. Please make sure the provided format is valid."
      });
      setFocus("value");
      return;
    }

    onParsedEnv(env);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormControl
        label="Secret Values"
        isError={Boolean(errors.value)}
        errorText={errors.value?.message}
      >
        <TextArea
          {...register("value")}
          placeholder="Paste secrets in .json, .yml or .env format..."
          className="h-[60vh] !resize-none"
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

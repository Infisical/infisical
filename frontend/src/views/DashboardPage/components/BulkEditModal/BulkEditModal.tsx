/* eslint-disable no-param-reassign */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { parseDotEnv } from "@app/components/utilities/parseDotEnv";
import { Button, FormControl, Input, Skeleton, TextArea } from "@app/components/v2";
import { useGetProjectSecrets } from "@app/hooks/api";
import { UserWsKeyPair } from "@app/hooks/api/types";
import { useDebounce } from "@app/hooks/useDebounce";

const formSchema = yup.object({
  secretPath: yup
    .string()
    .required()
    .label("Secret Path")
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  content: yup.string().required()
});

type TFormSchema = yup.InferType<typeof formSchema>;

interface Props {
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
  environment: string;
  onParsedEnv: (env: Record<string, { value: string; comments: string[] }>) => void;
  handleClose: () => void;
}

export const BulkEditModal = ({
  decryptFileKey,
  environment,
  workspaceId,
  onParsedEnv,
  handleClose
}: Props) => {
  const {
    handleSubmit,
    register,
    watch,
    formState: { isDirty },
    setValue
  } = useForm<TFormSchema>({
    resolver: yupResolver(formSchema),
    defaultValues: { secretPath: "/" }
  });

  const envCopySecPath = watch("secretPath");

  const debouncedEnvCopySecretPath = useDebounce(envCopySecPath);

  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    env: environment,
    secretPath: debouncedEnvCopySecretPath,
    isPaused: !(
      Boolean(workspaceId) &&
      Boolean(environment) &&
      Boolean(debouncedEnvCopySecretPath)
    ),
    decryptFileKey
  });

  useEffect(() => {
    if (secrets) {
      const content = secrets?.secrets.reduce((prev, curr) => {
        if (curr.comment.length) {
          prev += `#${curr.comment}\n`;
        }
        prev += `${curr.key}: ${curr.value}\n\n`;
        return prev;
      }, "");
      setValue("content", content);
    }
  }, [secrets]);

  const handleFormSubmit = (data: TFormSchema) => {
    const env = parseDotEnv(data.content);
    onParsedEnv(env);
    handleClose();
  };
  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <FormControl label="Secret Path" className="flex-grow" isRequired>
        <Input {...register("secretPath")} placeholder="Provide a path, default is /" />
      </FormControl>
      {isSecretsLoading &&
        Array.apply(0, Array(5)).map((_x, i) => (
          <Skeleton key={`secret-pull-loading-${i + 1}`} className="bg-mineshaft-700" />
        ))}
      {!isSecretsLoading && (
        <FormControl label="Secret Path" className="flex-grow" isRequired>
          <TextArea {...register("content")} rows={10} />
        </FormControl>
      )}
      <div className="flex items-center gap-x-2 pt-8">
        <Button type="submit" isDisabled={!isDirty}>
          Save
        </Button>
        <Button onClick={handleClose} variant="plain" colorSchema="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
};

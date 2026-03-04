import { Controller, useForm } from "react-hook-form";
import { faKey, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueries } from "@tanstack/react-query";
import { z } from "zod";

import {
  Button,
  Checkbox,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useProject } from "@app/context";
import { fetchSecretReferences, secretKeys } from "@app/hooks/api/secrets/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["moveSecrets"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["moveSecrets"]>, state?: boolean) => void;
  onMoveApproved: (moveParams: {
    destinationEnvironment: string;
    destinationSecretPath: string;
    shouldOverwrite: boolean;
  }) => void;
  secretsToMove: { id: string; key: string }[];
  environment: string;
  secretPath: string;
  projectId: string;
};

const formSchema = z.object({
  environment: z.string().trim(),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  shouldOverwrite: z.boolean().default(false)
});

type TFormSchema = z.infer<typeof formSchema>;

export const MoveSecretsModal = ({
  popUp,
  handlePopUpToggle,
  onMoveApproved,
  secretsToMove,
  environment,
  secretPath,
  projectId
}: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(formSchema) });

  const { currentProject } = useProject();
  const environments = currentProject?.environments || [];
  const selectedEnvironment = watch("environment");

  const referenceQueries = useQueries({
    queries: secretsToMove.map((secret) => ({
      queryKey: secretKeys.getSecretReferences({
        secretKey: secret.key,
        secretPath,
        environment,
        projectId
      }),
      queryFn: () =>
        fetchSecretReferences({
          secretKey: secret.key,
          secretPath,
          environment,
          projectId
        }),
      enabled: popUp.moveSecrets.isOpen && secretsToMove.length > 0
    }))
  });

  // aggregate all references and so we can calculate total count including hidden ones
  const allReferences = referenceQueries
    .filter((refQueries) => refQueries.data?.tree)
    .flatMap((q, idx) =>
      (q.data?.tree.children || []).map((child) => ({
        secretKey: child.key,
        environment: child.environment,
        secretPath: child.secretPath,
        movedSecretKey: secretsToMove[idx].key
      }))
    )
    .filter(
      (ref, index, self) =>
        index ===
        self.findIndex(
          (r) =>
            r.secretKey === ref.secretKey &&
            r.environment === ref.environment &&
            r.secretPath === ref.secretPath &&
            r.movedSecretKey === ref.movedSecretKey
        )
    );

  const hasReferences = allReferences.length > 0;
  const isLoadingReferences = referenceQueries.some((refQueries) => refQueries.isLoading);

  const handleFormSubmit = (data: TFormSchema) => {
    onMoveApproved({
      destinationEnvironment: data.environment,
      destinationSecretPath: data.secretPath,
      shouldOverwrite: data.shouldOverwrite
    });

    handlePopUpToggle("moveSecrets", false);
  };

  return (
    <Modal
      isOpen={popUp.moveSecrets.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("moveSecrets", isOpen);
      }}
    >
      <ModalContent
        title="Move Secrets"
        subTitle="Move secrets from the current path to the selected destination"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Controller
            control={control}
            name="environment"
            defaultValue={environments?.[0]?.slug}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Environment" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {environments.map(({ name, slug }) => (
                    <SelectItem value={slug} key={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="secretPath"
            defaultValue="/"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secret Path" isError={Boolean(error)} errorText={error?.message}>
                <SecretPathInput {...field} environment={selectedEnvironment} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="shouldOverwrite"
            defaultValue={false}
            render={({ field: { onBlur, value, onChange } }) => (
              <Checkbox
                id="overwrite-checkbox"
                className="ml-2"
                isChecked={value}
                onCheckedChange={onChange}
                onBlur={onBlur}
              >
                Overwrite existing secrets
              </Checkbox>
            )}
          />
          {hasReferences && !isLoadingReferences && (
            <div className="mt-4">
              <div className="mb-4 rounded-md border border-yellow-700/30 bg-yellow-900/20">
                <div className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 shrink-0 text-yellow-500">
                    <FontAwesomeIcon icon={faWarning} className="h-5 w-5" />
                  </div>
                  <p className="text-sm text-yellow-500">
                    {allReferences.length} secret{allReferences.length !== 1 ? "s" : ""} will have
                    their references updated to match the path after the secret has been moved.
                  </p>
                </div>
              </div>

              {allReferences.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-mineshaft-700">
                  <Table>
                    <THead className="sticky -top-1 bg-bunker-800">
                      <Th className="px-4">Type</Th>
                      <Th className="px-4">Environment</Th>
                      <Th className="truncate px-4">Path</Th>
                      <Th className="px-4">Secret Key</Th>
                    </THead>
                    <TBody>
                      {allReferences.map((ref) => (
                        <Tr
                          key={`${ref.secretKey}-${ref.environment}-${ref.secretPath}-${ref.movedSecretKey}`}
                        >
                          <Td>
                            <FontAwesomeIcon icon={faKey} className="h-4 w-4 text-gray-400" />
                          </Td>
                          <Td className="px-4">{ref.environment}</Td>
                          <Td className="truncate px-4">{ref.secretPath}</Td>
                          <Td className="px-4">{ref.secretKey}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}
          <div className="mt-7 flex items-center">
            <Button
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
              key="move-secrets-submit"
              className="mr-4"
              type="submit"
            >
              Move
            </Button>
            <Button
              key="move-secrets-cancel"
              onClick={() => handlePopUpToggle("moveSecrets", false)}
              variant="plain"
              colorSchema="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};

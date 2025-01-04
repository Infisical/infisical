import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faCheck, faCopy, faKey, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { format } from "date-fns";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  // DeleteActionModal,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import {
  useCreateIdentityUniversalAuthClientSecret,
  useGetIdentityUniversalAuth,
  useGetIdentityUniversalAuthClientSecrets
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup.object({
  description: yup.string(),
  ttl: yup
    .string()
    .test(
      "is-value-valid",
      "TTL cannot be greater than 315360000",
      (value) => Number(value) <= 315360000
    ),
  numUsesLimit: yup.string()
});

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["universalAuthClientSecret", "revokeClientSecret"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["revokeClientSecret"]>,
    data?: {
      clientSecretPrefix: string;
      clientSecretId: string;
    }
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["universalAuthClientSecret", "revokeClientSecret"]>,
    state?: boolean
  ) => void;
};

export const IdentityUniversalAuthClientSecretModal = ({
  popUp,
  handlePopUpOpen,
  handlePopUpToggle
}: Props) => {
  const { t } = useTranslation();

  const [token, setToken] = useState("");
  const [isClientSecretCopied, setIsClientSecretCopied] = useToggle(false);
  const [isClientIdCopied, setIsClientIdCopied] = useToggle(false);

  const popUpData = popUp?.universalAuthClientSecret?.data as {
    identityId?: string;
    name?: string;
  };

  const { data, isLoading } = useGetIdentityUniversalAuthClientSecrets(popUpData?.identityId ?? "");
  const { data: identityUniversalAuth } = useGetIdentityUniversalAuth(popUpData?.identityId ?? "");

  const { mutateAsync: createClientSecretMutateAsync } =
    useCreateIdentityUniversalAuthClientSecret();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      description: "",
      ttl: "",
      numUsesLimit: ""
    }
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isClientSecretCopied) {
      timer = setTimeout(() => setIsClientSecretCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isClientSecretCopied]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isClientIdCopied) {
      timer = setTimeout(() => setIsClientIdCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isClientIdCopied]);

  const onFormSubmit = async ({ description, ttl, numUsesLimit }: FormData) => {
    try {
      if (!popUpData?.identityId) return;

      const { clientSecret } = await createClientSecretMutateAsync({
        identityId: popUpData.identityId,
        description,
        ttl: Number(ttl),
        numUsesLimit: Number(numUsesLimit)
      });

      setToken(clientSecret);

      createNotification({
        text: "Successfully created client secret",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create client secret",
        type: "error"
      });
    }
  };

  const hasToken = Boolean(token);

  return (
    <Modal
      isOpen={popUp?.universalAuthClientSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("universalAuthClientSecret", isOpen);
        reset();
        setToken("");
      }}
    >
      <ModalContent title={`Manage Client ID/Secrets for ${popUpData?.name ?? ""}`}>
        <h2 className="mb-4">Client ID</h2>
        <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
          <p className="mr-4 break-all">{identityUniversalAuth?.clientId ?? ""}</p>
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => {
              navigator.clipboard.writeText(identityUniversalAuth?.clientId ?? "");
              setIsClientIdCopied.on();
            }}
          >
            <FontAwesomeIcon icon={isClientIdCopied ? faCheck : faCopy} />
            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
              {t("common.click-to-copy")}
            </span>
          </IconButton>
        </div>
        <h2 className="mb-4">New Client Secret</h2>
        {hasToken ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p>We will only show this secret once</p>
              <Button
                colorSchema="secondary"
                type="submit"
                onClick={() => {
                  reset();
                  setToken("");
                }}
              >
                Got it
              </Button>
            </div>
            <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
              <p className="mr-4 break-all">{token}</p>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  setIsClientSecretCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isClientSecretCopied ? faCheck : faCopy} />
                <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                  {t("common.click-to-copy")}
                </span>
              </IconButton>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onFormSubmit)} className="mb-8">
            <Controller
              control={control}
              defaultValue=""
              name="description"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Description (optional)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="Description" />
                </FormControl>
              )}
            />
            <div className="flex">
              <Controller
                control={control}
                defaultValue=""
                name="ttl"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="TTL (seconds - optional)"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <div className="flex">
                      <Input {...field} placeholder="0" type="number" min="0" step="1" />
                    </div>
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue="0"
                name="numUsesLimit"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Max Number of Uses"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    className="ml-4"
                  >
                    <div className="flex">
                      <Input {...field} placeholder="0" type="number" min="0" step="1" />
                      <Button
                        className="ml-4"
                        size="sm"
                        type="submit"
                        isLoading={isSubmitting}
                        isDisabled={isSubmitting}
                      >
                        Create
                      </Button>
                    </div>
                  </FormControl>
                )}
              />
            </div>
          </form>
        )}
        <h2 className="mb-4">Client Secrets</h2>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Description</Th>
                <Th>Num Uses</Th>
                <Th>Expires At</Th>
                <Th>Client Secret</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={5} innerKey="org-identities-client-secrets" />}
              {!isLoading &&
                data &&
                data.length > 0 &&
                data.map(
                  ({
                    id,
                    description,
                    clientSecretTTL,
                    clientSecretPrefix,
                    clientSecretNumUses,
                    clientSecretNumUsesLimit,
                    createdAt
                  }) => {
                    let expiresAt;
                    if (clientSecretTTL > 0) {
                      expiresAt = new Date(new Date(createdAt).getTime() + clientSecretTTL * 1000);
                    }

                    return (
                      <Tr className="h-10 items-center" key={`mi-client-secret-${id}`}>
                        <Td>{description === "" ? "-" : description}</Td>
                        <Td>{`${clientSecretNumUses}${
                          clientSecretNumUsesLimit ? `/${clientSecretNumUsesLimit}` : ""
                        }`}</Td>
                        <Td>{expiresAt ? format(expiresAt, "yyyy-MM-dd") : "-"}</Td>
                        <Td>{`${clientSecretPrefix}****`}</Td>
                        <Td>
                          <IconButton
                            onClick={() => {
                              handlePopUpOpen("revokeClientSecret", {
                                clientSecretPrefix,
                                clientSecretId: id
                              });
                            }}
                            size="lg"
                            colorSchema="primary"
                            variant="plain"
                            ariaLabel="update"
                          >
                            <FontAwesomeIcon icon={faXmark} />
                          </IconButton>
                        </Td>
                      </Tr>
                    );
                  }
                )}
              {!isLoading && data && data?.length === 0 && (
                <Tr>
                  <Td colSpan={5}>
                    <EmptyState
                      title="No client secrets have been created for this identity yet"
                      icon={faKey}
                    />
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};

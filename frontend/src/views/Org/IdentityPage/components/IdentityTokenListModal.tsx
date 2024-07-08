import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faCheck, faCopy, faKey, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
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
  useCreateTokenIdentityTokenAuth,
  useGetIdentityTokensTokenAuth,
  useGetIdentityUniversalAuthClientSecrets} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  name: z.string()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["tokenList", "revokeToken"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["revokeToken"]>, data?: {}) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["tokenList", "revokeToken"]>,
    state?: boolean
  ) => void;
};

export const IdentityTokenListModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { t } = useTranslation();

  const [token, setToken] = useState("");
  const [isClientSecretCopied, setIsClientSecretCopied] = useToggle(false);
  const [isClientIdCopied, setIsClientIdCopied] = useToggle(false);

  const popUpData = popUp?.tokenList?.data as {
    identityId: string;
    name: string;
  };

  const { data: tokens } = useGetIdentityTokensTokenAuth(popUpData?.identityId ?? "");
  const { data, isLoading } = useGetIdentityUniversalAuthClientSecrets(popUpData?.identityId ?? "");

  const { mutateAsync: createToken } = useCreateTokenIdentityTokenAuth();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: ""
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

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      if (!popUpData?.identityId) return;

      const newTokenData = await createToken({
        identityId: popUpData.identityId,
        name
      });

      setToken(newTokenData.accessToken);

      createNotification({
        text: "Successfully created token",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create token",
        type: "error"
      });
    }
  };

  const hasToken = Boolean(token);

  return (
    <Modal
      isOpen={popUp?.tokenList?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("tokenList", isOpen);
        reset();
        setToken("");
      }}
    >
      <ModalContent title={`Manage Access Tokens for ${popUpData?.name ?? ""}`}>
        <h2 className="mb-4">New Token</h2>
        {hasToken ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p>We will only show this token once</p>
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
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                  <div className="flex">
                    <Input {...field} placeholder="My Token" />
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
          </form>
        )}
        <h2 className="mb-4">Tokens</h2>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>name</Th>
                <Th>Num Uses</Th>
                <Th>Created At</Th>
                <Th>Max Expires At</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={5} innerKey="identities-tokens" />}
              {!isLoading &&
                tokens?.map(
                  ({
                    id,
                    createdAt,
                    name,
                    accessTokenNumUses,
                    accessTokenNumUsesLimit,
                    accessTokenMaxTTL,
                    isAccessTokenRevoked
                  }) => {
                    const expiresAt = new Date(
                      new Date(createdAt).getTime() + accessTokenMaxTTL * 1000
                    );

                    return (
                      <Tr className="h-10 items-center" key={`mi-client-secret-${id}`}>
                        <Td>{name === "" ? "-" : name}</Td>
                        <Td>{`${accessTokenNumUses}${
                          accessTokenNumUsesLimit ? `/${accessTokenNumUsesLimit}` : ""
                        }`}</Td>
                        <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                        <Td>
                          {isAccessTokenRevoked ? "Revoked" : `${format(expiresAt, "yyyy-MM-dd")}`}
                        </Td>
                        <Td>
                          {!isAccessTokenRevoked && (
                            <IconButton
                              onClick={() => {
                                handlePopUpOpen("revokeToken", {
                                  identityId: popUpData?.identityId,
                                  tokenId: id,
                                  name
                                });
                              }}
                              size="lg"
                              colorSchema="primary"
                              variant="plain"
                              ariaLabel="update"
                            >
                              <FontAwesomeIcon icon={faXmark} />
                            </IconButton>
                          )}
                        </Td>
                      </Tr>
                    );
                  }
                )}
              {!isLoading && data && data?.length === 0 && (
                <Tr>
                  <Td colSpan={5}>
                    <EmptyState
                      title="No tokens have been created for this identity yet"
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

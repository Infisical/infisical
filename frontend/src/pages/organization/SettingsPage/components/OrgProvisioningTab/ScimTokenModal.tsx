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
  DeleteActionModal,
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
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { useCreateScimToken, useDeleteScimToken, useGetScimTokens } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  description: z.string().optional(),
  ttlDays: z.string()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["scimToken", "deleteScimToken"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteScimToken"]>,
    data?: {
      scimTokenId: string;
    }
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["scimToken", "deleteScimToken"]>,
    state?: boolean
  ) => void;
};

export const ScimTokenModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { t } = useTranslation();

  const [token, setToken] = useState("");

  const [isScimUrlCopied, setIsScimUrlCopied] = useToggle(false);
  const [isScimTokenCopied, setIsScimTokenCopied] = useToggle(false);

  const { data, isPending } = useGetScimTokens(currentOrg?.id ?? "");
  const { mutateAsync: createScimTokenMutateAsync } = useCreateScimToken();
  const { mutateAsync: deleteScimTokenMutateAsync } = useDeleteScimToken();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: "",
      ttlDays: "365"
    }
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isScimUrlCopied) {
      timer = setTimeout(() => setIsScimUrlCopied.off(), 2000);
    }

    if (isScimTokenCopied) {
      timer = setTimeout(() => setIsScimTokenCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isScimTokenCopied, isScimUrlCopied]);

  const onFormSubmit = async ({ description, ttlDays }: FormData) => {
    if (!currentOrg?.id) return;

    const { scimToken } = await createScimTokenMutateAsync({
      organizationId: currentOrg.id,
      description,
      ttlDays: Number(ttlDays)
    });

    setToken(scimToken);

    createNotification({
      text: "Successfully created SCIM token",
      type: "success"
    });
  };

  const onDeleteScimTokenSubmit = async (scimTokenId: string) => {
    if (!currentOrg?.id) return;

    await deleteScimTokenMutateAsync({
      organizationId: currentOrg.id,
      scimTokenId
    });

    handlePopUpToggle("deleteScimToken", false);

    createNotification({
      text: "Successfully deleted SCIM token",
      type: "success"
    });
  };

  const hasToken = Boolean(token);
  const scimUrl = `${window.origin}/api/v1/scim`;

  return (
    <Modal
      isOpen={popUp?.scimToken?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("scimToken", isOpen);
        reset();
        setToken("");
      }}
    >
      <ModalContent title="Manage SCIM credentials">
        <h2 className="mb-4">SCIM URL</h2>
        <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
          <p className="mr-4 break-all">{scimUrl}</p>
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => {
              navigator.clipboard.writeText(scimUrl);
              setIsScimUrlCopied.on();
            }}
          >
            <FontAwesomeIcon icon={isScimUrlCopied ? faCheck : faCopy} />
            <span className="group-hover:animate-fade-in absolute -top-20 -left-8 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex">
              {t("common.click-to-copy")}
            </span>
          </IconButton>
        </div>
        <h2 className="mb-4">New SCIM Token</h2>
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
                  setIsScimTokenCopied.on();
                }}
              >
                <FontAwesomeIcon icon={isScimTokenCopied ? faCheck : faCopy} />
                <span className="group-hover:animate-fade-in absolute -top-20 -left-8 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex">
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
            <Controller
              control={control}
              defaultValue="365"
              name="ttlDays"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="TTL (days)" isError={Boolean(error)} errorText={error?.message}>
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
          </form>
        )}
        <h2 className="mb-4">SCIM Tokens</h2>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Description</Th>
                <Th>Expires At</Th>
                <Th>Created At</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={4} innerKey="org-scim-tokens" />}
              {!isPending &&
                data &&
                data.length > 0 &&
                data.map(({ id, description, ttlDays, createdAt }) => {
                  const isInvalidTTLDays = ttlDays > 9999; // added validation later so some users would still be using this
                  let expiresAt;
                  if (ttlDays > 0) {
                    expiresAt = isInvalidTTLDays
                      ? new Date()
                      : new Date(new Date(createdAt).getTime() + ttlDays * 86400 * 1000);
                  }

                  return (
                    <Tr className="h-10 items-center" key={`mi-client-secret-${id}`}>
                      <Td>{description === "" ? "-" : description}</Td>
                      <Td>
                        {expiresAt && !isInvalidTTLDays
                          ? format(expiresAt, "yyyy-MM-dd HH:mm:ss")
                          : "-"}
                      </Td>
                      <Td>{format(new Date(createdAt), "yyyy-MM-dd HH:mm:ss")}</Td>
                      <Td>
                        <IconButton
                          onClick={() => {
                            handlePopUpOpen("deleteScimToken", {
                              scimTokenId: id
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
                })}
              {!isPending && data && data?.length === 0 && (
                <Tr>
                  <Td colSpan={4}>
                    <EmptyState title="No SCIM tokens have been created yet" icon={faKey} />
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </TableContainer>
        <DeleteActionModal
          isOpen={popUp.deleteScimToken.isOpen}
          title="Are you sure you want to delete the SCIM token?"
          onChange={(isOpen) => handlePopUpToggle("scimToken", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() => {
            const deleteScimTokenData = popUp?.deleteScimToken?.data as {
              scimTokenId: string;
            };

            return onDeleteScimTokenSubmit(deleteScimTokenData.scimTokenId);
          }}
        />
      </ModalContent>
    </Modal>
  );
};

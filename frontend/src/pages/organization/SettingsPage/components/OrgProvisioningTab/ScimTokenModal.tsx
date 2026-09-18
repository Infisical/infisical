import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheckIcon, Copy, Info, MoreHorizontal, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Button,
  ButtonGroup,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { formatDateTime } from "@app/helpers/datetime";
import { useTimedReset } from "@app/hooks";
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

  const [token, setToken] = useState("");
  const [, isScimUrlCopied, setScimUrlCopied] = useTimedReset<string>({ initialState: "" });
  const [, isScimTokenCopied, setScimTokenCopied] = useTimedReset<string>({ initialState: "" });

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
  const hasTokens = !isPending && Boolean(data && data.length > 0);

  return (
    <>
      <Dialog
        open={popUp?.scimToken?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("scimToken", isOpen);
          reset();
          setToken("");
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-x-2">
              Manage SCIM Credentials
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/scim/overview" />
            </DialogTitle>
            <DialogDescription>
              Generate and manage the tokens your SCIM provider uses to authenticate.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-6">
              <FieldGroup>
                <Field>
                  <FieldLabel>SCIM URL</FieldLabel>
                  <ButtonGroup className="w-full">
                    <Input value={scimUrl} readOnly aria-label="SCIM URL" className="font-mono" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconButton
                          variant="outline"
                          aria-label="Copy SCIM URL"
                          onClick={() => {
                            navigator.clipboard.writeText(scimUrl);
                            setScimUrlCopied("copied");
                          }}
                        >
                          {isScimUrlCopied ? <ClipboardCheckIcon /> : <Copy />}
                        </IconButton>
                      </TooltipTrigger>
                      <TooltipContent>{isScimUrlCopied ? "Copied" : "Copy"}</TooltipContent>
                    </Tooltip>
                  </ButtonGroup>
                </Field>
                {hasToken ? (
                  <>
                    <Field>
                      <FieldLabel>New SCIM Token</FieldLabel>
                      <ButtonGroup className="w-full">
                        <Input
                          value={token}
                          readOnly
                          aria-label="SCIM token"
                          className="font-mono"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              variant="outline"
                              aria-label="Copy SCIM token"
                              onClick={() => {
                                navigator.clipboard.writeText(token);
                                setScimTokenCopied("copied");
                              }}
                            >
                              {isScimTokenCopied ? <ClipboardCheckIcon /> : <Copy />}
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent>{isScimTokenCopied ? "Copied" : "Copy"}</TooltipContent>
                        </Tooltip>
                      </ButtonGroup>
                    </Field>
                    <Alert variant="info">
                      <Info />
                      <AlertTitle>Copy this token now</AlertTitle>
                      <AlertDescription>You won&apos;t be able to see it again.</AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <>
                    <Controller
                      control={control}
                      name="description"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="scim-token-description">
                            Description (Optional)
                          </FieldLabel>
                          <Input
                            id="scim-token-description"
                            placeholder="Description"
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="ttlDays"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="scim-token-ttl">TTL (Days)</FieldLabel>
                          <Input
                            id="scim-token-ttl"
                            placeholder="0"
                            type="number"
                            min="0"
                            step="1"
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                  </>
                )}
              </FieldGroup>
              {!hasToken && (
                <div>
                  <div className="mb-2 text-sm font-medium text-foreground">SCIM Tokens</div>
                  {isPending || hasTokens ? (
                    <Table containerClassName="max-h-[40vh] overflow-y-auto overflow-x-hidden">
                      <TableHeader className="sticky top-0 z-[1] [&_th]:bg-container">
                        <TableRow>
                          <TableHead className="w-full" isTruncatable>
                            Description
                          </TableHead>
                          <TableHead>Expires At</TableHead>
                          <TableHead>Created At</TableHead>
                          <TableHead className="w-px text-right" aria-label="Actions" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isPending &&
                          Array.from({ length: 3 }).map((_, idx) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <TableRow key={`scim-token-skeleton-${idx}`}>
                              <TableCell colSpan={4}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))}
                        {!isPending &&
                          data?.map(({ id, description, ttlDays, createdAt }) => {
                            const isInvalidTTLDays = ttlDays > 9999; // added validation later so some users would still be using this
                            let expiresAt;
                            if (ttlDays > 0) {
                              expiresAt = isInvalidTTLDays
                                ? new Date()
                                : new Date(new Date(createdAt).getTime() + ttlDays * 86400 * 1000);
                            }

                            return (
                              <TableRow key={`scim-token-${id}`}>
                                <TableCell isTruncatable className="font-medium text-foreground">
                                  {description === "" ? (
                                    <span className="text-muted">—</span>
                                  ) : (
                                    description
                                  )}
                                </TableCell>
                                <TableCell>
                                  {expiresAt && !isInvalidTTLDays ? (
                                    formatDateTime({ timestamp: expiresAt })
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </TableCell>
                                <TableCell>{formatDateTime({ timestamp: createdAt })}</TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <IconButton
                                        variant="ghost"
                                        size="xs"
                                        aria-label={`Actions for SCIM token ${description || id}`}
                                      >
                                        <MoreHorizontal />
                                      </IconButton>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                      <DropdownMenuItem
                                        variant="danger"
                                        onClick={() => {
                                          handlePopUpOpen("deleteScimToken", {
                                            scimTokenId: id
                                          });
                                        }}
                                      >
                                        <Trash2 />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  ) : (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyTitle>No SCIM tokens</EmptyTitle>
                        <EmptyDescription>
                          Create a token above to authenticate your SCIM provider.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              {hasToken ? (
                <DialogClose asChild>
                  <Button type="button" variant="org">
                    Got It
                  </Button>
                </DialogClose>
              ) : (
                <>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">
                      Close
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="org" isPending={isSubmitting}>
                    Create Token
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={popUp.deleteScimToken.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteScimToken", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete SCIM Token?</AlertDialogTitle>
            <AlertDialogDescription>
              Any SCIM provider using this token will no longer be able to authenticate. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                const deleteScimTokenData = popUp?.deleteScimToken?.data as {
                  scimTokenId: string;
                };

                return onDeleteScimTokenSubmit(deleteScimTokenData.scimTokenId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

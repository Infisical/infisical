import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import {
  AlertTriangleIcon,
  CheckIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  InfoIcon,
  LoaderIcon,
  PencilIcon
} from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button as ButtonV2,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Switch as SwitchV2,
  Tooltip as TooltipV2
} from "@app/components/v2";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAlert,
  UnstableAlertTitle,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import {
  CaRenewalStatus,
  CaStatus,
  CaType,
  InternalCaType,
  useGetCa,
  useGetCaAutoRenewal,
  useUpdateCaAutoRenewal
} from "@app/hooks/api";
import { caStatusToNameMap, caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { caKeys } from "@app/hooks/api/ca/queries";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { usePopUp } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
};

const getStatusVariant = (status: CaStatus) => {
  switch (status) {
    case CaStatus.ACTIVE:
      return "success";
    case CaStatus.PENDING_CERTIFICATE:
      return "warning";
    case CaStatus.DISABLED:
      return "danger";
    default:
      return "neutral";
  }
};

const autoRenewalSchema = z.object({
  autoRenewalEnabled: z.boolean(),
  autoRenewalDaysBeforeExpiry: z.coerce.number().min(1).max(365)
});

type AutoRenewalFormData = z.infer<typeof autoRenewalSchema>;

export const CaDetailsSection = ({ caId }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const queryClient = useQueryClient();
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const { popUp, handlePopUpToggle } = usePopUp(["editAutoRenewal"] as const);

  const { data } = useGetCa({
    caId,
    type: CaType.INTERNAL
  });

  const ca = data as TInternalCertificateAuthority;

  const { data: parentCaData } = useGetCa({
    caId: ca?.configuration?.parentCaId || "",
    type: CaType.INTERNAL,
    options: {
      enabled: Boolean(ca?.configuration?.parentCaId)
    }
  });

  const parentCa = parentCaData as TInternalCertificateAuthority | undefined;

  const { data: autoRenewal } = useGetCaAutoRenewal(caId, {
    enabled:
      Boolean(caId) &&
      (ca?.status === CaStatus.ACTIVE || ca?.status === CaStatus.PENDING_CERTIFICATE)
  });

  const prevStatusRef = useRef(autoRenewal?.lastRenewalStatus);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = autoRenewal?.lastRenewalStatus;
    prevStatusRef.current = currentStatus;

    if (
      prevStatus === CaRenewalStatus.PENDING &&
      currentStatus &&
      currentStatus !== CaRenewalStatus.PENDING
    ) {
      queryClient.invalidateQueries({ queryKey: caKeys.getCaById(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCerts(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCert(caId) });
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(CaType.INTERNAL, currentProject.id)
      });
    }
  }, [autoRenewal?.lastRenewalStatus, caId, currentProject.id, queryClient]);

  const { mutateAsync: updateAutoRenewal } = useUpdateCaAutoRenewal();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<AutoRenewalFormData>({
    resolver: zodResolver(autoRenewalSchema),
    values: {
      autoRenewalEnabled: autoRenewal?.autoRenewalEnabled ?? false,
      autoRenewalDaysBeforeExpiry: autoRenewal?.autoRenewalDaysBeforeExpiry ?? 30
    }
  });

  const watchEnabled = watch("autoRenewalEnabled");

  if (!ca) {
    return <div />;
  }

  const onAutoRenewalSubmit = async ({
    autoRenewalEnabled,
    autoRenewalDaysBeforeExpiry
  }: AutoRenewalFormData) => {
    try {
      await updateAutoRenewal({
        caId,
        autoRenewalEnabled,
        ...(autoRenewalEnabled && { autoRenewalDaysBeforeExpiry })
      });
      createNotification({
        text: "Renewal settings updated",
        type: "success"
      });
      handlePopUpToggle("editAutoRenewal", false);
    } catch {
      createNotification({
        text: "Failed to update renewal settings",
        type: "error"
      });
    }
  };

  const getNextRenewalDate = () => {
    if (
      !autoRenewal?.autoRenewalEnabled ||
      !autoRenewal.autoRenewalDaysBeforeExpiry ||
      !ca.configuration.notAfter
    ) {
      return null;
    }
    return addDays(new Date(ca.configuration.notAfter), -autoRenewal.autoRenewalDaysBeforeExpiry);
  };

  const showAutoRenewal =
    (ca.status === CaStatus.ACTIVE || ca.status === CaStatus.PENDING_CERTIFICATE) && autoRenewal;

  return (
    <>
      <UnstableCard className="w-full">
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Details</UnstableCardTitle>
          <UnstableCardDescription>Certificate authority details</UnstableCardDescription>
          {showAutoRenewal && (
            <UnstableCardAction>
              <UnstableIconButton
                variant="outline"
                size="xs"
                onClick={() => handlePopUpToggle("editAutoRenewal", true)}
              >
                <PencilIcon />
              </UnstableIconButton>
            </UnstableCardAction>
          )}
        </UnstableCardHeader>
        <UnstableCardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>CA Type</DetailLabel>
              <DetailValue>{caTypeToNameMap[ca.configuration.type]}</DetailValue>
            </Detail>

            <Detail>
              <DetailLabel>CA ID</DetailLabel>
              <DetailValue className="flex items-center gap-x-1">
                <span className="break-all">{ca.id}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <UnstableIconButton
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        navigator.clipboard.writeText(ca.id);
                        setCopyTextId("Copied");
                      }}
                    >
                      {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                    </UnstableIconButton>
                  </TooltipTrigger>
                  <TooltipContent>{isCopyingId ? "Copied" : "Copy ID to clipboard"}</TooltipContent>
                </Tooltip>
              </DetailValue>
            </Detail>

            {ca.configuration.type === InternalCaType.INTERMEDIATE &&
              ca.status !== CaStatus.PENDING_CERTIFICATE && (
                <Detail>
                  <DetailLabel>Parent CA</DetailLabel>
                  <DetailValue className="flex items-center gap-x-1">
                    {ca.configuration.parentCaId ? (
                      <Badge variant="neutral" asChild>
                        <Link
                          to="/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId"
                          params={{
                            orgId: currentOrg.id,
                            projectId: currentProject.id,
                            caId: ca.configuration.parentCaId
                          }}
                        >
                          {parentCa?.name || ca.configuration.parentCaId}
                          <ExternalLinkIcon />
                        </Link>
                      </Badge>
                    ) : (
                      <span className="break-all">N/A - External Parent CA</span>
                    )}
                  </DetailValue>
                </Detail>
              )}

            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{ca.name}</DetailValue>
            </Detail>

            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                <Badge variant={getStatusVariant(ca.status)}>{caStatusToNameMap[ca.status]}</Badge>
              </DetailValue>
            </Detail>

            <Detail>
              <DetailLabel>Key Algorithm</DetailLabel>
              <DetailValue>{certKeyAlgorithmToNameMap[ca.configuration.keyAlgorithm]}</DetailValue>
            </Detail>

            {showAutoRenewal && (
              <>
                <Detail>
                  <DetailLabel>Auto-Renewal</DetailLabel>
                  <DetailValue>
                    <Badge variant={autoRenewal.autoRenewalEnabled ? "success" : "neutral"}>
                      {autoRenewal.autoRenewalEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </DetailValue>
                </Detail>

                {autoRenewal.lastRenewalAt && (
                  <Detail>
                    <DetailLabel>Last Renewal</DetailLabel>
                    <DetailValue>
                      {format(new Date(autoRenewal.lastRenewalAt), "MMM d, yyyy 'at' h:mm a")}
                    </DetailValue>
                  </Detail>
                )}

                {autoRenewal.lastRenewalStatus && (
                  <Detail>
                    <DetailLabel>Last Installation Status</DetailLabel>
                    <DetailValue>
                      {autoRenewal.lastRenewalStatus === CaRenewalStatus.FAILED &&
                      autoRenewal.lastRenewalMessage ? (
                        <TooltipV2
                          position="right"
                          content={autoRenewal.lastRenewalMessage}
                          className="max-w-md break-words"
                        >
                          <Badge variant="danger">Failed</Badge>
                        </TooltipV2>
                      ) : (
                        <Badge
                          variant={(() => {
                            if (autoRenewal.lastRenewalStatus === CaRenewalStatus.SUCCESS)
                              return "success";
                            if (autoRenewal.lastRenewalStatus === CaRenewalStatus.PENDING)
                              return "info";
                            return "danger";
                          })()}
                        >
                          {autoRenewal.lastRenewalStatus === CaRenewalStatus.PENDING
                            ? "Installing..."
                            : autoRenewal.lastRenewalStatus.charAt(0).toUpperCase() +
                              autoRenewal.lastRenewalStatus.slice(1)}
                        </Badge>
                      )}
                    </DetailValue>
                  </Detail>
                )}
              </>
            )}
          </DetailGroup>

          {showAutoRenewal && autoRenewal.lastRenewalStatus === CaRenewalStatus.PENDING && (
            <UnstableAlert variant="info" className="mt-2">
              <LoaderIcon className="animate-spin" />
              <UnstableAlertTitle>Certificate installation in progress...</UnstableAlertTitle>
            </UnstableAlert>
          )}

          {showAutoRenewal &&
            autoRenewal.lastRenewalStatus !== CaRenewalStatus.PENDING &&
            autoRenewal.autoRenewalEnabled &&
            (autoRenewal.lastRenewalStatus === CaRenewalStatus.FAILED &&
            autoRenewal.lastRenewalMessage ? (
              <UnstableAlert className="mt-2 border-warning/20 bg-warning/5 text-warning">
                <AlertTriangleIcon />
                <UnstableAlertTitle>
                  Last renewal failed: {autoRenewal.lastRenewalMessage}
                </UnstableAlertTitle>
              </UnstableAlert>
            ) : (
              (() => {
                const nextRenewalDate = getNextRenewalDate();
                if (!nextRenewalDate) return null;
                return (
                  <UnstableAlert variant="info" className="mt-2">
                    <InfoIcon />
                    <UnstableAlertTitle>
                      Next auto-renewal: {format(nextRenewalDate, "MMM d, yyyy")}
                    </UnstableAlertTitle>
                  </UnstableAlert>
                );
              })()
            ))}
        </UnstableCardContent>
      </UnstableCard>

      <Modal
        isOpen={popUp.editAutoRenewal.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("editAutoRenewal", isOpen);
          if (!isOpen) reset();
        }}
      >
        <ModalContent title="Edit Renewal Settings">
          <form onSubmit={handleSubmit(onAutoRenewalSubmit)}>
            <Controller
              control={control}
              name="autoRenewalEnabled"
              render={({ field: { value, onChange } }) => (
                <FormControl>
                  <SwitchV2
                    id="auto-renewal-enabled"
                    className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                    thumbClassName="bg-mineshaft-800"
                    isChecked={value}
                    onCheckedChange={onChange}
                  >
                    Auto-Renewal
                  </SwitchV2>
                </FormControl>
              )}
            />
            {watchEnabled && (
              <Controller
                control={control}
                name="autoRenewalDaysBeforeExpiry"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Days Before Expiry"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    helperText="Number of days before certificate expiry to trigger auto-renewal"
                  >
                    <Input {...field} type="number" min={1} max={365} />
                  </FormControl>
                )}
              />
            )}
            <div className="flex w-full justify-between gap-4 pt-4">
              <ModalClose asChild>
                <ButtonV2 colorSchema="secondary" variant="plain">
                  Cancel
                </ButtonV2>
              </ModalClose>
              <ButtonV2
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
                type="submit"
                colorSchema="secondary"
              >
                Save
              </ButtonV2>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};

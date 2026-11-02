import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  CertificateAuthoritiesUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  ComboboxActionCreationConfig,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { caKeys, useGetCaQuota } from "@app/hooks/api/ca/queries";
import { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { CreateCaWizard } from "../CertificateAuthoritiesPage/components/CreateCaWizard/CreateCaWizard";
import { ExternalCaModal } from "../CertificateAuthoritiesPage/components/ExternalCaModal";

export const useCaCreation = <TOption,>(
  onCreated: (ca: TUnifiedCertificateAuthority) => void | Promise<void>
) => {
  const { permission } = useProjectPermission();
  const canCreate = permission.can(
    ProjectPermissionCertificateAuthorityActions.Create,
    ProjectPermissionSub.CertificateAuthorities
  );
  const inputId = useId();
  const queryClient = useQueryClient();
  const { data: quota } = useGetCaQuota({ enabled: canCreate });
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [isChooserOpen, setIsChooserOpen] = useState(false);
  const [isInternalOpen, setIsInternalOpen] = useState(false);
  const [kind, setKind] = useState("internal");
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["ca"] as const);

  const acceptCreated = async (ca: TUnifiedCertificateAuthority) => {
    await queryClient.refetchQueries({ queryKey: caKeys.listCasByProjectId() });
    const listedCa = queryClient
      .getQueryData<TUnifiedCertificateAuthority[]>(caKeys.listCasByProjectId())
      ?.find((option) => option.id === ca.id);
    if (!listedCa) {
      createNotification({
        type: "error",
        text: "The certificate authority was created, but the list could not be refreshed. Refresh the list to select it."
      });
      return;
    }
    await onCreated(listedCa);
  };

  const startCreation = () => {
    setIsChooserOpen(false);
    const limits =
      kind === "internal"
        ? [quota?.certificateAuthorities, quota?.internalCertificateAuthorities]
        : [quota?.certificateAuthorities];
    if (limits.some((limit) => typeof limit?.limit === "number" && limit.used >= limit.limit)) {
      openUpgradeGate({
        intent: CertificateAuthoritiesUpgradeIntent,
        paywallKey: kind === "internal" ? "cert-manager.ca" : "cert-manager.external-ca"
      });
      return;
    }
    if (kind === "internal") {
      setIsInternalOpen(true);
      return;
    }
    handlePopUpOpen("ca");
  };

  const creation: ComboboxActionCreationConfig<TOption> | undefined = canCreate
    ? {
        mode: "action",
        emptyLabel: "Create Certificate Authority",
        formatLabel: () => "Create Certificate Authority",
        onAction: () => {
          setKind("internal");
          setIsChooserOpen(true);
        }
      }
    : undefined;

  return {
    creation,
    caCreationModals: (
      <>
        <Dialog open={isChooserOpen} onOpenChange={setIsChooserOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Certificate Authority</DialogTitle>
              <DialogDescription>
                Choose where the certificate authority is hosted.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex min-h-0 flex-1 flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                startCreation();
              }}
            >
              <DialogBody>
                <Field>
                  <FieldLabel htmlFor={inputId}>Certificate Authority Type</FieldLabel>
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger id={inputId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="external">External</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsChooserOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="project">
                  Continue
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {isInternalOpen && (
          <CreateCaWizard isOpen onOpenChange={setIsInternalOpen} onComplete={acceptCreated} />
        )}
        {popUp.ca.isOpen && (
          <ExternalCaModal
            popUp={popUp}
            handlePopUpToggle={handlePopUpToggle}
            onComplete={acceptCreated}
          />
        )}
        {upgradeGate}
      </>
    )
  };
};

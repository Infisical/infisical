import { useId, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, List, ListRow } from "@infisical/cipher/ui/list";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Switch } from "@infisical/cipher/ui/switch";
import { format } from "date-fns";

import { CertificateRevocationListsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { ProjectPermissionCertificateAuthorityActions } from "@app/context/ProjectPermissionContext/types";
import { downloadTxtFile } from "@app/helpers/download";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import {
  DEFAULT_CRL_VALIDITY_DAYS,
  type TInternalCertificateAuthority
} from "@app/hooks/api/ca/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { CaPlan } from "../../data/certificate-authorities/contract";
import { useUpgradeGate } from "../../license/useUpgradeGate";
import {
  type CrlUrl,
  crlUrlErrors,
  crlValidityIssue,
  toCrlUrls
} from "../CertificateAuthoritiesPage/crl";
import { CrlUrlsField, CrlValidityField } from "../CertificateAuthoritiesPage/crl-fields";
import { caBlock, useCaScope } from "../CertificateAuthoritiesPage/scope";

type Configuration = Partial<TInternalCertificateAuthority["configuration"]>;

const expired = (ca: TInternalCertificateAuthority) =>
  Boolean(ca.configuration.notAfter && new Date(ca.configuration.notAfter) <= new Date());

const useUpdateConfiguration = (ca: TInternalCertificateAuthority) => {
  const update = useV4Adapter("certificateAuthorities").useUpdateCa();
  const apply = async (configuration: Configuration, success: string) => {
    try {
      const { crlWarning } = await update.mutateAsync({
        id: ca.id,
        type: CaType.INTERNAL,
        configuration: configuration as TInternalCertificateAuthority["configuration"]
      });
      if (crlWarning) {
        toast({
          tone: "neutral",
          title: `${success}, CRL not regenerated`,
          description: crlWarning
        });
        return true;
      }
      saved(success);
      return true;
    } catch (error) {
      failed("Could not update revocation settings", error);
      return false;
    }
  };
  return { apply, pending: update.isPending };
};

const CrlSettingsDialog = ({
  ca,
  plan,
  open,
  onClose
}: {
  ca: TInternalCertificateAuthority;
  plan?: CaPlan;
  open: boolean;
  onClose: () => void;
}) => {
  const formId = useId();
  const { apply, pending } = useUpdateConfiguration(ca);
  const current = ca.configuration.crlDistributionPointUrls ?? [];
  const currentValidity = ca.configuration.crlValidityDays ?? DEFAULT_CRL_VALIDITY_DAYS;
  const [urls, setUrls] = useState<CrlUrl[]>(() => toCrlUrls(current));
  const [validity, setValidity] = useState(String(currentValidity));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const isExpired = expired(ca);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty:
      JSON.stringify(urls.map((url) => url.value)) !== JSON.stringify(current) ||
      validity !== String(currentValidity),
    onDiscard: onClose
  });

  const submit = async () => {
    const next = { ...crlUrlErrors(urls), crlValidityDays: crlValidityIssue(validity) };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const submitted = urls.map((url) => url.value.trim());
    const changed: Configuration = {
      ...((submitted.length !== current.length ||
        submitted.some((url, index) => url !== current[index])) && {
        crlDistributionPointUrls: submitted
      }),
      ...(Number(validity) !== currentValidity && { crlValidityDays: Number(validity) })
    };
    if (Object.keys(changed).length === 0) {
      onClose();
      return;
    }
    if (await apply(changed, "CRL settings updated")) onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !pending && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Edit CRL settings</DialogTitle>
            <DialogDescription>
              URL changes apply to certificates issued after you save. Changing the validity
              regenerates the CRL.
            </DialogDescription>
          </DialogHeader>
          <form
            id={formId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <CrlUrlsField
                urls={urls}
                errors={errors}
                locked={!plan?.caCrl}
                onChange={(next) => {
                  setUrls(next);
                  setErrors({});
                }}
              />
              <CrlValidityField
                value={validity}
                error={errors.crlValidityDays}
                locked={!plan?.caCrl}
                disabledReason={
                  isExpired
                    ? "This CA has expired. Renew it to change the CRL validity."
                    : undefined
                }
                onChange={(value) => {
                  setValidity(value);
                  setErrors((currentErrors) => ({ ...currentErrors, crlValidityDays: undefined }));
                }}
              />
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="primary" type="submit" form={formId} loading={pending}>
              Save
            </Button>
            <Button variant="outline" disabled={pending} onClick={requestDiscard}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your changes to the CRL settings will be lost."
      />
    </>
  );
};

const OcspLabel = ({ locked }: { locked: boolean }) => (
  <Inline gap={8} align="center">
    OCSP
    {locked && (
      <Badge size="sm" tone="info">
        Enterprise
      </Badge>
    )}
  </Inline>
);

const RevocationDetails = ({ ca }: { ca: TInternalCertificateAuthority }) => {
  const mirrors = ca.configuration.crlDistributionPointUrls ?? [];
  const validity = ca.configuration.crlValidityDays ?? DEFAULT_CRL_VALIDITY_DAYS;
  return (
    <DataList
      variant="props"
      density="compact"
      items={[
        ...(ca.configuration.isOcspEnabled
          ? [
              [
                "OCSP responder URL",
                <code key="ocsp">{`${window.origin}/api/v1/cert-manager/ocsp/${ca.id}`}</code>
              ] as const
            ]
          : []),
        [
          "CRL mirror URLs",
          mirrors.length ? (
            <Stack key="mirrors" gap={4}>
              {mirrors.map((url) => (
                <code key={url}>{url}</code>
              ))}
            </Stack>
          ) : (
            "None"
          )
        ],
        ["CRL validity", `${validity} ${validity === 1 ? "day" : "days"}`]
      ]}
    />
  );
};

export const RevocationCard = ({
  ca,
  plan
}: {
  ca: TInternalCertificateAuthority;
  plan?: CaPlan;
}) => {
  const { permission } = useCaScope();
  const { apply, pending } = useUpdateConfiguration(ca);
  const [editing, setEditing] = useState(false);
  const editBlock = caBlock(permission, ProjectPermissionCertificateAuthorityActions.Edit, ca.name);
  const saveBlock = editBlock ?? (pending ? "Saving" : undefined);
  const ocspOn = ca.configuration.isOcspEnabled ?? false;
  const ocspLocked = !plan?.pkiOcsp;

  return (
    <Card
      variant="framed"
      title="Revocation"
      hint="How clients check whether certificates issued by this CA are revoked. Changes apply to certificates issued afterwards."
      action={
        <Button
          variant="outline"
          size="sm"
          icon="pencil"
          disabledReason={editBlock}
          onClick={() => setEditing(true)}
        >
          Edit CRL settings
        </Button>
      }
    >
      <Stack gap={16}>
        <Switch
          layout="row"
          label={<OcspLabel locked={ocspLocked} />}
          description="Issued certificates carry an OCSP responder URL that answers revocation checks for them."
          checked={ocspOn}
          disabledReason={
            saveBlock ?? (ocspLocked && !ocspOn ? "OCSP is on the Enterprise plan" : undefined)
          }
          onCheckedChange={(checked) =>
            apply({ isOcspEnabled: checked }, checked ? "OCSP enabled" : "OCSP disabled")
          }
        />
        <Switch
          layout="row"
          label="Managed CRL URL"
          description="Embed the Infisical-managed CRL endpoint in issued certificates. Turn it off to include only the mirror URLs."
          checked={!ca.configuration.disableManagedCrlDistributionPointUrl}
          disabledReason={saveBlock}
          onCheckedChange={(checked) =>
            apply(
              { disableManagedCrlDistributionPointUrl: !checked },
              checked ? "Managed CRL URL enabled" : "Managed CRL URL disabled"
            )
          }
        />
        <RevocationDetails ca={ca} />
      </Stack>
      {editing && (
        <CrlSettingsDialog ca={ca} plan={plan} open={editing} onClose={() => setEditing(false)} />
      )}
    </Card>
  );
};

export const CrlList = ({ ca, plan }: { ca: TInternalCertificateAuthority; plan?: CaPlan }) => {
  const { permission } = useCaScope();
  const adapter = useV4Adapter("certificateAuthorities");
  const { data: crls = [], isPending } = adapter.useCaCrls(ca.id);
  const regenerate = adapter.useRegenerateCaCrl();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [confirming, setConfirming] = useState(false);
  const regenerateBlock =
    caBlock(permission, ProjectPermissionCertificateAuthorityActions.Edit, ca.name) ??
    (ca.status === CaStatus.PENDING_CERTIFICATE
      ? "This CA has no certificate yet. Add one before regenerating the CRL"
      : undefined) ??
    (expired(ca) ? "Renew this expired CA to regenerate the CRL" : undefined);

  return (
    <>
      <List
        label="Certificate revocation lists"
        title="Certificate revocation lists"
        size="sm"
        loading={isPending}
        loadingRows={2}
        action={
          crls.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon="sync"
              disabledReason={regenerateBlock}
              onClick={() => {
                if (plan?.caCrl) {
                  setConfirming(true);
                  return;
                }
                openUpgradeGate({
                  intent: {
                    ...CertificateRevocationListsUpgradeIntent,
                    upgradeLabel: "Unlock CRL regeneration",
                    title: "Regenerate CRL",
                    description:
                      "Regenerating a CRL on demand is included with the Enterprise plan. Review the plan to continue."
                  },
                  paywallKey: "cert-manager.ca-crl-regenerate"
                });
              }}
            >
              Regenerate CRL
            </Button>
          )
        }
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="file"
            title="No CRLs yet"
            description="A CRL is published once this CA has a certificate. Each one is regenerated before it expires."
          />
        }
      >
        {crls.map((crl) => {
          const url = `${window.origin}/api/v1/cert-manager/crl/${crl.id}/der`;
          return (
            <ListRow
              key={crl.id}
              value={crl.id}
              label={url}
              media={<Icon name="file" />}
              title={<MiddleTruncate text={url} mono />}
              description={`Updated ${format(new Date(crl.thisUpdate), "yyyy-MM-dd")}, next update ${format(new Date(crl.nextUpdate), "yyyy-MM-dd")}`}
              meta={crl.crlNumber === null ? undefined : `CRL ${crl.crlNumber}`}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" icon="more" iconOnly>
                      CRL options
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        navigator.clipboard.writeText(url);
                        saved("CRL URL copied");
                      }}
                    >
                      <Icon name="copy" />
                      Copy CRL URL
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        downloadTxtFile(
                          crl.crlNumber === null
                            ? `${ca.name}-crl.pem`
                            : `${ca.name}-crl-${crl.crlNumber}.pem`,
                          crl.crl
                        )
                      }
                    >
                      <Icon name="download" />
                      Download CRL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          );
        })}
      </List>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent pending={regenerate.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate CRL?</AlertDialogTitle>
            <AlertDialogDescription>
              A new CRL with the current list of revoked certificates replaces the one at the same
              URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              loading={regenerate.isPending}
              onClick={async () => {
                try {
                  await regenerate.mutateAsync({ caId: ca.id });
                  saved("CRL regenerated");
                  setConfirming(false);
                } catch (error) {
                  failed("Could not regenerate the CRL", error);
                }
              }}
            >
              Regenerate CRL
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {upgradeGate}
    </>
  );
};

import { useId, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";

import { CaRenewalType, CaSigningConfigType } from "@app/hooks/api/ca/enums";
import type { TCaSigningConfig } from "@app/hooks/api/ca/queries";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const invalidDate = (value: string) => !value || Number.isNaN(new Date(value).getTime());

export const RenewCaDialog = ({
  caId,
  signingConfig,
  open,
  onClose
}: {
  caId: string;
  signingConfig?: TCaSigningConfig | null;
  open: boolean;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const renew = adapter.useRenewCa();
  const venafi = adapter.useInstallCaCertificateVenafi();
  const adcs = adapter.useInstallCaCertificateAdcs();
  const formId = useId();
  const [notAfter, setNotAfter] = useState("");
  const [error, setError] = useState<string>();
  const provider =
    (signingConfig?.type === CaSigningConfigType.VENAFI && "Venafi") ||
    (signingConfig?.type === CaSigningConfigType.AZURE_ADCS && "ADCS") ||
    undefined;
  const pending = renew.isPending || venafi.isPending || adcs.isPending;

  const close = () => {
    setNotAfter("");
    setError(undefined);
    onClose();
  };

  const submit = async () => {
    if (provider) {
      try {
        await (provider === "Venafi" ? venafi : adcs).mutateAsync({ caId });
        saved("Certificate renewal queued");
        close();
      } catch (failure) {
        failed(`Could not renew the CA certificate through ${provider}`, failure);
      }
      return;
    }
    if (invalidDate(notAfter)) {
      setError("Enter a valid date");
      return;
    }
    try {
      await renew.mutateAsync({ caId, notAfter, type: CaRenewalType.EXISTING });
      saved("CA renewed");
      close();
    } catch (failure) {
      failed("Could not renew the CA", failure);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && close()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Renew CA</DialogTitle>
          <DialogDescription>
            {(provider === "Venafi" &&
              "This CA signs through Venafi TLS Protect Cloud. Renewing submits a new CSR to Venafi and installs the renewed certificate.") ||
              (provider === "ADCS" &&
                "This CA signs through Azure ADCS. Renewing submits a new CSR to ADCS and installs the renewed certificate.") ||
              "Issues a new CA certificate with the same key pair."}
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
          {!provider && (
            <Stack gap={16}>
              <Field label="Valid until" error={error}>
                <Input
                  type="date"
                  width="sm"
                  value={notAfter}
                  invalid={Boolean(error)}
                  onChange={(event) => {
                    setNotAfter(event.target.value);
                    setError(undefined);
                  }}
                />
              </Field>
            </Stack>
          )}
        </form>
        <DialogFooter>
          <Button variant="primary" type="submit" form={formId} loading={pending}>
            {provider ? `Renew via ${provider}` : "Renew"}
          </Button>
          <Button variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const GenerateRootCertificateDialog = ({
  caId,
  open,
  onClose
}: {
  caId: string;
  open: boolean;
  onClose: () => void;
}) => {
  const generate = useV4Adapter("certificateAuthorities").useGenerateCaCertificate();
  const formId = useId();
  const [notAfter, setNotAfter] = useState("");
  const [maxPathLength, setMaxPathLength] = useState("-1");
  const [error, setError] = useState<string>();

  const close = () => {
    setNotAfter("");
    setMaxPathLength("-1");
    setError(undefined);
    onClose();
  };

  const submit = async () => {
    if (invalidDate(notAfter)) {
      setError("Enter a valid date");
      return;
    }
    if (new Date(notAfter) <= new Date()) {
      setError("Valid until must be in the future");
      return;
    }
    try {
      await generate.mutateAsync({
        caId,
        notBefore: new Date().toISOString(),
        notAfter,
        maxPathLength: Number(maxPathLength)
      });
      saved("Root CA certificate generated");
      close();
    } catch (failure) {
      failed("Could not generate the root CA certificate", failure);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !generate.isPending && close()}>
      <DialogContent pending={generate.isPending}>
        <DialogHeader>
          <DialogTitle>Generate root CA certificate</DialogTitle>
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
            <Field label="Valid until" error={error}>
              <Input
                type="date"
                width="sm"
                value={notAfter}
                invalid={Boolean(error)}
                onChange={(event) => {
                  setNotAfter(event.target.value);
                  setError(undefined);
                }}
              />
            </Field>
            <Field
              label="Path length"
              description="How many intermediate CAs may follow this CA in the chain. -1 means no limit."
            >
              <Select
                aria-label="Path length"
                width="xs"
                value={maxPathLength}
                options={[-1, 0, 1, 2, 3, 4].map((value) => ({
                  value: String(value),
                  label: String(value)
                }))}
                onValueChange={setMaxPathLength}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="primary" type="submit" form={formId} loading={generate.isPending}>
            Generate certificate
          </Button>
          <Button variant="outline" disabled={generate.isPending} onClick={close}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

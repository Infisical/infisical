import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import type { KmipClientCertificate, TKmipClient } from "@app/hooks/api/kmip/types";

import { CopyButton } from "../../access/org/detail-parts";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { keyAlgorithmOptions } from "./shared";

import css from "./kmip.module.css";

const methods = [
  {
    value: "managed",
    label: "Managed",
    description: "Infisical generates and manages the private key."
  },
  {
    value: "csr",
    label: "Certificate signing request (CSR)",
    description: "Sign a CSR from a device that generates its own private key, such as Dell iDRAC."
  }
];

const CSR_PLACEHOLDER =
  "-----BEGIN CERTIFICATE REQUEST-----\nMIIByDCCAU4CAQAwfjELMAkGA1UEBhMCVVMx...\n-----END CERTIFICATE REQUEST-----";

const Literal = ({ value, label }: { value: string; label: string }) => (
  <span className={`${css.value} ${css.mono}`}>
    {value}
    <CopyButton value={value} label={label} />
  </span>
);

export const KmipCertificateSheet = ({
  client,
  onClose,
  onIssued
}: {
  client: TKmipClient;
  onClose: () => void;
  onIssued: (certificate: KmipClientCertificate) => void;
}) => {
  const generate = useV4Adapter("kmip").useGenerateClientCertificate();
  const [method, setMethod] = useState("managed");
  const [ttl, setTtl] = useState("");
  const [keyAlgorithm, setKeyAlgorithm] = useState<string>(CertKeyAlgorithm.RSA_2048);
  const [csr, setCsr] = useState("");
  const [errors, setErrors] = useState<{ ttl?: string; csr?: string }>({});
  const [pending, setPending] = useState(false);
  const isCsr = method === "csr";

  const submit = async () => {
    const next = {
      ttl: ttl.trim() ? undefined : "TTL is required",
      csr: isCsr && !csr.trim() ? "CSR is required" : undefined
    };
    setErrors(next);
    if (next.ttl || next.csr) return;
    setPending(true);
    try {
      const certificate = await generate.mutateAsync({
        clientId: client.id,
        ttl,
        ...(isCsr ? { csr } : { keyAlgorithm: keyAlgorithm as CertKeyAlgorithm })
      });
      saved(`Successfully ${isCsr ? "signed" : "generated"} KMIP client certificate`);
      onIssued(certificate);
      onClose();
    } catch (error) {
      failed("Failed to create certificate", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>{`Certificate for ${client.name}`}</SheetTitle>
          <SheetDescription>
            Generate a private key or sign a certificate signing request for this client.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="kmip-client-certificate"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field
                label="Request method"
                description={methods.find((entry) => entry.value === method)?.description}
                wide
              >
                <Select
                  label="Request method"
                  value={method}
                  options={methods.map(({ value, label }) => ({ value, label }))}
                  onChange={setMethod}
                />
              </Field>
              <Field label="TTL" error={errors.ttl} wide>
                <Input
                  autoFocus
                  placeholder="2 days, 1d, 2h, 1y, ..."
                  value={ttl}
                  invalid={Boolean(errors.ttl)}
                  onChange={(event) => setTtl(event.target.value)}
                />
              </Field>
              {isCsr ? (
                <>
                  <Field label="Certificate signing request" error={errors.csr} wide>
                    <Textarea
                      mono
                      rows={8}
                      spellCheck={false}
                      placeholder={CSR_PLACEHOLDER}
                      value={csr}
                      aria-invalid={Boolean(errors.csr) || undefined}
                      onChange={(event) => setCsr(event.target.value)}
                    />
                  </Field>
                  <Card
                    variant="framed"
                    title="Certificate subject values"
                    description="The signed certificate uses these fixed CN and OU values. Use them if your device asks for subject values when it generates the CSR. O, L, ST and C values from the CSR carry over."
                  >
                    <DataList
                      variant="props"
                      density="compact"
                      items={[
                        [
                          "CN, the client ID",
                          <Literal key="cn" value={client.id} label="Copy client ID" />
                        ],
                        [
                          "OU, the project ID",
                          <Literal key="ou" value={client.projectId} label="Copy project ID" />
                        ]
                      ]}
                    />
                  </Card>
                </>
              ) : (
                <Field label="Key algorithm" description="Signs the client certificate." wide>
                  <Select
                    label="Key algorithm"
                    value={keyAlgorithm}
                    options={keyAlgorithmOptions}
                    onChange={setKeyAlgorithm}
                  />
                </Field>
              )}
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="kmip-client-certificate"
              loading={pending}
            >
              {isCsr ? "Sign certificate" : "Generate certificate"}
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

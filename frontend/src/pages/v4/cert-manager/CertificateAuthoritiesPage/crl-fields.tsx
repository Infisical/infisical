import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";

import { CertificateRevocationListsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  DEFAULT_CRL_VALIDITY_DAYS,
  MAX_CRL_VALIDITY_DAYS,
  MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS,
  MIN_CRL_VALIDITY_DAYS
} from "@app/hooks/api/ca/types";

import { useUpgradeGate } from "../../license/useUpgradeGate";
import type { CrlUrl, FieldErrors } from "./crl";

const addUrlBlock = (locked: boolean, count: number) => {
  if (locked) return "Custom CRL URLs are on the Enterprise plan";
  if (count >= MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS)
    return `Up to ${MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS} URLs`;
  return undefined;
};

const CrlUrlRow = ({
  url,
  index,
  error,
  onChange,
  onRemove
}: {
  url: CrlUrl;
  index: number;
  error?: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) => (
  <Field error={error}>
    <Inline gap={8} align="center">
      <Input
        aria-label={`CRL URL ${index + 1}`}
        value={url.value}
        mono
        placeholder="https://crl.example.com/internal-ca.crl"
        invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button variant="outline" size="icon" icon="trash" iconOnly onClick={onRemove}>
        Remove URL
      </Button>
    </Inline>
  </Field>
);

export const CrlUrlsField = ({
  urls,
  errors,
  locked,
  onChange
}: {
  urls: CrlUrl[];
  errors: FieldErrors;
  locked: boolean;
  onChange: (urls: CrlUrl[]) => void;
}) => (
  <Field
    group
    label="CRL distribution points"
    optional
    description={
      locked
        ? "Custom CRL distribution points are on the Enterprise plan."
        : `Backup CRL URLs embedded in issued certificates. Up to ${MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS} URLs.`
    }
    wide
  >
    <Stack gap={8}>
      {urls.map((url, index) => (
        <CrlUrlRow
          key={url.id}
          url={url}
          index={index}
          error={errors[url.id]}
          onChange={(value) =>
            onChange(urls.map((entry) => (entry.id === url.id ? { ...entry, value } : entry)))
          }
          onRemove={() => onChange(urls.filter((entry) => entry.id !== url.id))}
        />
      ))}
      <div>
        <Button
          variant="outline"
          size="sm"
          icon="plus"
          disabledReason={addUrlBlock(locked, urls.length)}
          onClick={() => onChange([...urls, { id: crypto.randomUUID(), value: "" }])}
        >
          Add URL
        </Button>
      </div>
    </Stack>
  </Field>
);

const useCrlValidityGate = (locked: boolean) => {
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const gate = () =>
    locked &&
    openUpgradeGate({
      intent: {
        ...CertificateRevocationListsUpgradeIntent,
        upgradeLabel: "Unlock CRL validity",
        title: "Set CRL validity",
        description:
          "Custom CRL validity is included with the Enterprise plan. Review the plan to continue."
      },
      paywallKey: "cert-manager.ca-crl-validity"
    });
  return { gate, upgradeGate };
};

const isTyping = (event: React.KeyboardEvent) =>
  (event.key.length === 1 || event.key === "Backspace") && !event.metaKey;

export const CrlValidityField = ({
  value,
  error,
  locked,
  disabledReason,
  onChange
}: {
  value: string;
  error?: string;
  locked: boolean;
  disabledReason?: string;
  onChange: (value: string) => void;
}) => {
  const { gate, upgradeGate } = useCrlValidityGate(locked);
  const canReset = locked && !disabledReason && Number(value) !== DEFAULT_CRL_VALIDITY_DAYS;
  return (
    <Field
      label={
        <Inline gap={8} align="center">
          CRL validity (days)
          {locked && (
            <Badge size="sm" tone="info">
              Enterprise
            </Badge>
          )}
        </Inline>
      }
      description={
        disabledReason ??
        `How long each CRL is valid, from ${MIN_CRL_VALIDITY_DAYS} to ${MAX_CRL_VALIDITY_DAYS} days. It is regenerated before it expires.`
      }
      error={error}
    >
      <Inline gap={8} align="center">
        <Input
          type="number"
          width="xs"
          min={MIN_CRL_VALIDITY_DAYS}
          max={MAX_CRL_VALIDITY_DAYS}
          value={value}
          readOnly={locked}
          disabled={Boolean(disabledReason)}
          invalid={Boolean(error)}
          onClick={gate}
          onKeyDown={(event) => isTyping(event) && gate()}
          onChange={(event) => onChange(event.target.value)}
        />
        {canReset && (
          <Button variant="outline" onClick={() => onChange(String(DEFAULT_CRL_VALIDITY_DAYS))}>
            {`Reset to ${DEFAULT_CRL_VALIDITY_DAYS} days`}
          </Button>
        )}
      </Inline>
      {upgradeGate}
    </Field>
  );
};

import { useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText, Text } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import ms from "ms";

import { getObjectFromSeconds } from "@app/helpers/datetime";
import type { Organization } from "@app/hooks/api/organization/types";

import { failed, toast } from "../access/toast";
import { useV4Adapter } from "../data/adapters";
import type { BrandingAssetType } from "../data/secret-sharing/contract";
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, HEX_COLOR_EXAMPLE } from "./public/shared";

import styles from "./settings.module.css";

const NO_EDIT = "You need permission to edit organization settings.";
const MAX_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const MIN_LIFETIME_SECONDS = 5 * 60;
const MAX_FILE_SIZE = 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg"];
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

type Props = { organization: Organization; canEdit: boolean };

const ExternalSharing = ({ organization, canEdit }: Props) => {
  const updateOrganization = useV4Adapter("org").useUpdateOrganization();
  const enabled = organization.allowSecretSharingOutsideOrganization ?? true;
  const toggle = (
    <Switch
      aria-label="Allow sharing outside this organization"
      checked={enabled}
      disabled={!canEdit || updateOrganization.isPending}
      onCheckedChange={async (value) => {
        try {
          await updateOrganization.mutateAsync({
            orgId: organization.id,
            allowSecretSharingOutsideOrganization: value
          });
          toast({
            tone: "ok",
            title: value
              ? "Secrets can now be shared outside this organization"
              : "Secrets can no longer be shared outside this organization"
          });
        } catch (error) {
          failed("Could not update external sharing", error);
        }
      }}
    />
  );
  return (
    <SettingsCard
      flush
      title="Allow sharing outside this organization"
      description="When off, shared secrets can only be opened by members of this organization."
      action={
        canEdit ? (
          toggle
        ) : (
          <Tooltip content={NO_EDIT}>
            <span>{toggle}</span>
          </Tooltip>
        )
      }
    />
  );
};

const limitsOf = (organization: Organization) => {
  const lifetime = getObjectFromSeconds(organization.maxSharedSecretLifetime, ["m", "h", "d"]);
  return {
    lifetimeValue: String(lifetime.value),
    lifetimeUnit: lifetime.unit as string,
    shouldLimitView: Boolean(organization.maxSharedSecretViewLimit),
    viewLimit: organization.maxSharedSecretViewLimit?.toString() || "1"
  };
};

const ShareLimits = ({ organization, canEdit }: Props) => {
  const updateOrganization = useV4Adapter("org").useUpdateOrganization();
  const [saved, setSaved] = useState(() => limitsOf(organization));
  const [draft, setDraft] = useState(saved);
  const lifetimeSeconds = ms(`${draft.lifetimeValue}${draft.lifetimeUnit}`) / 1000;
  let lifetimeError: string | undefined;
  if (!Number.isInteger(Number(draft.lifetimeValue)) || Number(draft.lifetimeValue) < 1)
    lifetimeError = "Value must be at least 1";
  else if (lifetimeSeconds > MAX_LIFETIME_SECONDS)
    lifetimeError = "Duration exceeds a maximum of 30 days";
  else if (lifetimeSeconds < MIN_LIFETIME_SECONDS)
    lifetimeError = "Duration must be at least 5 minutes";
  const views = Number(draft.viewLimit);
  const viewError =
    draft.shouldLimitView && (!Number.isInteger(views) || views < 1 || views > 1000)
      ? "Enter a whole number from 1 to 1000"
      : undefined;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <SettingsCard
      title="Secret share limits"
      description="The most any shared secret in this organization can allow. New links cannot exceed them."
      dirty={dirty}
      locked={canEdit ? undefined : NO_EDIT}
      onDiscard={() => setDraft(saved)}
      onSave={async () => {
        if (lifetimeError || viewError)
          throw new Error("Fix the highlighted fields, then save again.");
        await updateOrganization.mutateAsync({
          orgId: organization.id,
          maxSharedSecretLifetime: lifetimeSeconds,
          maxSharedSecretViewLimit: draft.shouldLimitView ? views : null
        });
        setSaved(draft);
        toast({ tone: "ok", title: "Updated secret share limits" });
      }}
    >
      <Stack gap={16}>
        <Inline gap={12} align="start" wrap={false} className={styles.pair}>
          <Field label="Max lifetime" error={lifetimeError} className={styles.grow}>
            <Input
              type="number"
              min={1}
              step={1}
              value={draft.lifetimeValue}
              invalid={Boolean(lifetimeError)}
              onChange={(event) => setDraft({ ...draft, lifetimeValue: event.target.value })}
            />
          </Field>
          <Field label="Time unit" className={styles.grow}>
            <Select
              value={draft.lifetimeUnit}
              options={[
                { value: "m", label: "Minutes" },
                { value: "h", label: "Hours" },
                { value: "d", label: "Days" }
              ]}
              onChange={(lifetimeUnit) => setDraft({ ...draft, lifetimeUnit })}
            />
          </Field>
        </Inline>
        <Inline gap={12} align="start" wrap={false} className={styles.pair}>
          <Field label="Max views" className={styles.grow}>
            <Select
              value={String(draft.shouldLimitView)}
              options={[
                { value: "false", label: "Unlimited" },
                { value: "true", label: "Limited" }
              ]}
              onChange={(value) => setDraft({ ...draft, shouldLimitView: value === "true" })}
            />
          </Field>
          {draft.shouldLimitView ? (
            <Field label="View limit" error={viewError} className={styles.grow}>
              <Input
                type="number"
                min={1}
                max={1000}
                value={draft.viewLimit}
                invalid={Boolean(viewError)}
                onChange={(event) => setDraft({ ...draft, viewLimit: event.target.value })}
              />
            </Field>
          ) : (
            <span className={styles.grow} />
          )}
        </Inline>
      </Stack>
    </SettingsCard>
  );
};

const AssetRow = ({
  assetType,
  title,
  description,
  hasAsset,
  canEdit
}: {
  assetType: BrandingAssetType;
  title: string;
  description: string;
  hasAsset: boolean;
  canEdit: boolean;
}) => {
  const sharing = useV4Adapter("secretSharing");
  const { data: preview, isPending } = sharing.useBrandingAsset(assetType, hasAsset);
  const upload = sharing.useUploadBrandingAsset();
  const remove = sharing.useDeleteBrandingAsset();
  const input = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const busy = upload.isPending || remove.isPending;
  const noun = title.toLowerCase();
  return (
    <div className={styles.asset}>
      {hasAsset && (
        <div className={styles.assetPreview}>
          {isPending && <Skeleton className={styles.assetImage} />}
          {preview && <img src={preview} alt={`${title} preview`} className={styles.assetImage} />}
        </div>
      )}
      <div className={styles.grow}>
        <Text>{title}</Text>
        <SmallText muted>{description}</SmallText>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={ALLOWED_FILE_TYPES.join(",")}
        onChange={async (event) => {
          const picker = event.currentTarget;
          const file = picker.files?.[0];
          picker.value = "";
          if (!file) return;
          if (file.size > MAX_FILE_SIZE) {
            toast({ tone: "bad", title: "File too large. Maximum size is 1MB" });
            return;
          }
          if (!ALLOWED_FILE_TYPES.includes(file.type)) {
            toast({ tone: "bad", title: "Invalid file type. Upload a PNG or JPEG image." });
            return;
          }
          try {
            await upload.mutateAsync({ assetType, file });
            toast({ tone: "ok", title: `Uploaded ${noun}` });
          } catch (error) {
            failed(`Could not upload the ${noun}`, error);
          }
        }}
      />
      <Inline gap={8} wrap={false}>
        {hasAsset && (
          <Button
            variant="outline"
            size="sm"
            icon="trash"
            disabledReason={canEdit ? undefined : NO_EDIT}
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            Delete
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          icon="upload"
          disabledReason={canEdit ? undefined : NO_EDIT}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {hasAsset ? "Replace" : "Upload"}
        </Button>
      </Inline>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${noun}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Shared secret pages stop showing your ${noun}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                setDeleting(false);
                try {
                  await remove.mutateAsync({ assetType });
                  toast({ tone: "ok", title: `Deleted ${noun}` });
                } catch (error) {
                  failed(`Could not delete the ${noun}`, error);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const ColorField = ({
  label,
  description,
  placeholder,
  value,
  error,
  disabled,
  onChange,
  onCommit
}: {
  label: string;
  description: string;
  placeholder: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) => (
  <Field label={label} description={error ? undefined : description} error={error}>
    <Input
      mono
      value={value}
      placeholder={placeholder}
      invalid={Boolean(error)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onCommit(event.target.value)}
      trailing={
        <input
          ref={(node) => {
            if (!node) return undefined;
            const commit = () => onCommit(node.value);
            node.addEventListener("change", commit);
            return () => node.removeEventListener("change", commit);
          }}
          type="color"
          aria-label={`Pick ${label.toLowerCase()}`}
          className={styles.swatch}
          value={HEX_COLOR.test(value) ? value : placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      }
    />
  </Field>
);

const Branding = ({ organization, canEdit }: Props) => {
  const sharing = useV4Adapter("secretSharing");
  const updateOrganization = useV4Adapter("org").useUpdateOrganization();
  const { data: entitled, isPending } = sharing.useBrandingEntitlement(organization.id);
  const { data: config } = sharing.useBrandingConfig();
  const storedPrimary = organization.secretShareBrandConfig?.primaryColor || "";
  const storedSecondary = organization.secretShareBrandConfig?.secondaryColor || "";
  const stored = useMemo(
    () => ({ primaryColor: storedPrimary, secondaryColor: storedSecondary }),
    [storedPrimary, storedSecondary]
  );
  const { value, edit, save, status, pending } = useAutosave({
    value: stored,
    errorMessage: "Couldn't update brand colors. Try again.",
    onSave: async ({ primaryColor, secondaryColor }) => {
      await updateOrganization.mutateAsync({
        orgId: organization.id,
        secretShareBrandConfig:
          primaryColor || secondaryColor
            ? {
                primaryColor: primaryColor || undefined,
                secondaryColor: secondaryColor || undefined
              }
            : null
      });
      toast({ tone: "ok", title: "Updated branding colors" });
    }
  });
  if (isPending) return <SettingsCard title="Custom branding" loading />;
  if (!entitled)
    return (
      <SettingsCard
        flush
        title={
          <Inline gap={8}>
            Custom branding
            <Badge tone="info">Enterprise</Badge>
          </Inline>
        }
        description="Show your own logo, favicon and colors on shared secret pages."
        action={
          <Button asChild variant="outline" size="sm">
            <a href="https://infisical.com/schedule-demo" target="_blank" rel="noreferrer">
              Talk to us
            </a>
          </Button>
        }
      />
    );
  const colorError = (hex: string) =>
    hex && !HEX_COLOR.test(hex) ? `Use a hex color, such as ${HEX_COLOR_EXAMPLE}` : undefined;
  const errors = {
    primary: colorError(value.primaryColor),
    secondary: colorError(value.secondaryColor)
  };
  const commit = (next: typeof value) => {
    if (colorError(next.primaryColor) || colorError(next.secondaryColor)) return;
    if (next.primaryColor === stored.primaryColor && next.secondaryColor === stored.secondaryColor)
      return;
    save(next);
  };
  return (
    <>
      <SettingsCard title="Branding assets" flush>
        <div className={styles.assets}>
          <AssetRow
            assetType="brand-logo"
            title="Logo"
            description="Shown on shared secret pages. PNG or JPEG, max 1MB."
            hasAsset={config?.hasLogo ?? false}
            canEdit={canEdit}
          />
          <AssetRow
            assetType="brand-favicon"
            title="Favicon"
            description="Shown in the browser tab. PNG or JPEG, max 1MB."
            hasAsset={config?.hasFavicon ?? false}
            canEdit={canEdit}
          />
        </div>
      </SettingsCard>
      <SettingsCard title="Brand colors" locked={canEdit ? undefined : NO_EDIT} saveStatus={status}>
        <Inline gap={12} align="start" wrap={false} className={styles.pair}>
          <div className={styles.grow}>
            <ColorField
              label="Primary color"
              description="Page background."
              placeholder={DEFAULT_PRIMARY}
              value={value.primaryColor}
              error={errors.primary}
              disabled={pending}
              onChange={(primaryColor) => edit({ ...value, primaryColor })}
              onCommit={(primaryColor) => commit({ ...value, primaryColor })}
            />
          </div>
          <div className={styles.grow}>
            <ColorField
              label="Secondary color"
              description="Panel and component background."
              placeholder={DEFAULT_SECONDARY}
              value={value.secondaryColor}
              error={errors.secondary}
              disabled={pending}
              onChange={(secondaryColor) => edit({ ...value, secondaryColor })}
              onCommit={(secondaryColor) => commit({ ...value, secondaryColor })}
            />
          </div>
        </Inline>
      </SettingsCard>
    </>
  );
};

export const SecretSharingSettings = ({ organization, canEdit }: Props) => (
  <Stack gap={24}>
    <ExternalSharing organization={organization} canEdit={canEdit} />
    <ShareLimits key={organization.id} organization={organization} canEdit={canEdit} />
    <Branding key={`branding-${organization.id}`} organization={organization} canEdit={canEdit} />
  </Stack>
);

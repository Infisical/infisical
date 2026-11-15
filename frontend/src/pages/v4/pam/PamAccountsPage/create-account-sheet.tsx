import { useMemo, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inset } from "@infisical/cipher/ui/inset";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Select } from "@infisical/cipher/ui/select";
import { Meta, Text } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Link } from "@tanstack/react-router";
import axios from "axios";

import {
  EnterprisePamAccountsUpgradeIntent,
  PamAccountLimitUpgradeIntent
} from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  accountTypeRequiresRecording,
  gatewaySupportsAccountType,
  PamAccountType,
  PamResourcePermissionActions,
  type TPamAccountTemplateWithCount
} from "@app/hooks/api/pam";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useOrgId } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import { orgHref, useGo } from "../../links";
import { GatewayPicker, type GatewayPickerValue } from "../../networking/gateway-picker";
import {
  applyForcedRules,
  buildDefaultFieldValues,
  knownFieldsFor,
  missingFieldErrors,
  REQUIRED,
  serverFieldErrors,
  type TFieldErrors,
  type TFieldGroup,
  type TFieldValues
} from "./account-form";
import { CreateFolderDialog } from "./folder-dialogs";
import { SchemaFields } from "./schema-fields";
import { SshCaNotice } from "./ssh-ca-notice";

const CREATE_FOLDER = "__create_folder__";
const NO_GATEWAY: GatewayPickerValue = { gatewayId: null, gatewayPoolId: null };
const EMPTY_VALUES: TFieldValues = { connectionDetails: {}, credentials: {} };

export const CreateAccountSheet = ({
  open,
  onOpenChange,
  defaultFolderId,
  folderLocked = false,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFolderId?: string;
  folderLocked?: boolean;
  onCreated?: (accountId: string) => void;
}) => {
  const orgId = useOrgId();
  const go = useGo();
  const pam = useV4Adapter("pam");
  const networking = useV4Adapter("networking");
  const { data: org } = useV4Adapter("org").useOrganization(orgId);
  const { data: subscription } = networking.useSubscription(orgId);
  const { data: gateways = [] } = networking.useGateways();
  const { data: capabilities } = pam.useAccessCapabilities();
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const { data: folders = [] } = pam.useFolders({
    filterByAction: PamResourcePermissionActions.CreateAccounts
  });
  const { data: templates = [] } = pam.useTemplates();
  const create = pam.useCreateAccount();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const isProductAdmin = Boolean(capabilities?.isProductAdmin);

  const [step, setStep] = useState(0);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [values, setValues] = useState<TFieldValues>(EMPTY_VALUES);
  const [gateway, setGateway] = useState<GatewayPickerValue>(NO_GATEWAY);
  const [errors, setErrors] = useState<TFieldErrors>({});
  const [discarding, setDiscarding] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const createdId = useRef<string | null>(null);

  const typeMap = useMemo(
    () => new Map(accountTypes.map((meta) => [meta.type as string, meta])),
    [accountTypes]
  );
  const template = templates.find(({ id }) => id === templateId);
  const metadata = template ? typeMap.get(template.type) : undefined;
  const dirty = Boolean(
    templateId || name || description || (folderId && folderId !== (defaultFolderId ?? ""))
  );

  const unsupportedOn = (gatewayId: string | null | undefined, type: string) => {
    const attached = gatewayId ? gateways.find(({ id }) => id === gatewayId) : undefined;
    return attached && !gatewaySupportsAccountType(attached, type) ? attached.name : null;
  };
  // An account can't override its template's individual gateway, so under the org's pool
  // requirement such a template can't create accounts until the template moves to a pool.
  const unusableReason = (candidate: TPamAccountTemplateWithCount) => {
    const gatewayName = unsupportedOn(candidate.gatewayId, candidate.type);
    if (gatewayName) return `Gateway ${gatewayName} does not support this type`;
    if (org?.requireGatewayPools && candidate.gatewayId)
      return "Uses an individual gateway, but your organization requires a gateway pool";
    return null;
  };

  const needsGateway = Boolean(
    template &&
    metadata?.requiresGateway !== false &&
    !template.gatewayId &&
    !template.gatewayPoolId
  );
  const needsRecording = Boolean(
    template && accountTypeRequiresRecording(template.type) && !template.recordingConnectionId
  );
  const selectedGatewayUnsupported = template
    ? unsupportedOn(gateway.gatewayId, template.type)
    : null;

  const query = templateSearch.trim().toLowerCase();
  const visibleTemplates = templates.filter((candidate) => {
    if (!query) return true;
    const typeName = typeMap.get(candidate.type)?.name ?? candidate.type;
    return `${candidate.name} ${candidate.description ?? ""} ${candidate.type} ${typeName}`
      .toLowerCase()
      .includes(query);
  });

  const reset = () => {
    setStep(0);
    setFolderId(defaultFolderId ?? "");
    setTemplateId("");
    setTemplateSearch("");
    setName("");
    setDescription("");
    setValues(EMPTY_VALUES);
    setGateway(NO_GATEWAY);
    setErrors({});
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const picked = templates.find((candidate) => candidate.id === id);
    const meta = picked ? typeMap.get(picked.type) : undefined;
    setValues(
      meta
        ? applyForcedRules(meta, {
            connectionDetails: buildDefaultFieldValues(meta.connectionFields),
            credentials: buildDefaultFieldValues(meta.credentialFields)
          })
        : EMPTY_VALUES
    );
    setGateway(NO_GATEWAY);
    setErrors({});
  };

  const changeField = (group: TFieldGroup) => (key: string, value: unknown) => {
    setValues((current) => {
      const next = { ...current, [group]: { ...current[group], [key]: value } };
      return metadata ? applyForcedRules(metadata, next) : next;
    });
    setErrors((current) => ({ ...current, [`${group}.${key}`]: "" }));
  };

  const submit = async () => {
    if (!template || !metadata) return false;
    const nextErrors: TFieldErrors = missingFieldErrors(metadata, values);
    if (!name.trim()) nextErrors.name = REQUIRED;
    if (needsGateway && !gateway.gatewayId && !gateway.gatewayPoolId)
      nextErrors.gateway = "A gateway is required";
    if (selectedGatewayUnsupported)
      nextErrors.gateway = `Gateway ${selectedGatewayUnsupported} does not support this account type. Update the gateway, or pick another one.`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return false;
    try {
      const account = await create.mutateAsync({
        accountType: template.type,
        name: name.trim(),
        description: description.trim() || undefined,
        folderId,
        templateId,
        connectionDetails: values.connectionDetails,
        credentials: values.credentials,
        ...(gateway.gatewayId ? { gatewayId: gateway.gatewayId } : {}),
        ...(gateway.gatewayPoolId ? { gatewayPoolId: gateway.gatewayPoolId } : {})
      });
      saved("Account created");
      createdId.current = account.id;
      return true;
    } catch (error) {
      const data = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string; message?: string } | undefined)
        : undefined;
      if (
        data?.error === "PAM_ACCOUNT_LIMIT_REACHED" ||
        (typeof data?.message === "string" && data.message.includes("plan limit reached"))
      ) {
        openUpgradeGate({ intent: PamAccountLimitUpgradeIntent, paywallKey: "pam.account-limit" });
        return false;
      }
      const { fields, unmapped } = serverFieldErrors(error, knownFieldsFor(metadata));
      setErrors(fields);
      if (unmapped.length || !Object.keys(fields).length)
        failed(
          "Failed to create account",
          unmapped.length ? new Error(unmapped.join(", ")) : error
        );
      return false;
    }
  };

  const folderOptions = [
    ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
    {
      value: CREATE_FOLDER,
      label: "Create folder",
      disabled: !isProductAdmin,
      description: isProductAdmin ? undefined : "Only product admins can create folders"
    }
  ];

  let templateStepBlocker: string | undefined;
  if (!folderId) templateStepBlocker = "Select a folder";
  else if (!template) templateStepBlocker = "Select a template";
  else templateStepBlocker = unusableReason(template) ?? undefined;

  const templateStep = (
    <Stack gap={16}>
      {!folderLocked && (
        <Field label="Folder" error={errors.folderId}>
          <Select
            label="Folder"
            placeholder="Select folder"
            value={folderId}
            options={folderOptions}
            onChange={(next) => {
              if (next === CREATE_FOLDER) {
                setCreatingFolder(true);
                return;
              }
              setFolderId(next);
            }}
          />
        </Field>
      )}
      <FieldSet
        legend="Account template"
        actions={
          isProductAdmin ? (
            <Button variant="ghost" size="sm" iconRight="external" asChild>
              <Link {...go.link(orgHref(orgId, "/pam/templates"))} target="_blank">
                Manage templates
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              iconRight="external"
              disabledReason="Only product admins can manage templates"
            >
              Manage templates
            </Button>
          )
        }
      >
        <Stack gap={12}>
          <Input
            icon="search"
            aria-label="Search templates"
            placeholder="Search templates..."
            value={templateSearch}
            onChange={(event) => setTemplateSearch(event.target.value)}
          />
          {visibleTemplates.length === 0 ? (
            <EmptyState
              size="sm"
              media="bare"
              icon={templates.length ? "search" : "file"}
              title={templates.length ? "No templates match your search" : "No templates yet"}
            />
          ) : (
            <RadioGroup value={templateId} onValueChange={pickTemplate}>
              {visibleTemplates.map((candidate) => {
                const meta = typeMap.get(candidate.type);
                const reason = unusableReason(candidate);
                const typeName = meta?.name ?? candidate.type;
                return (
                  <RadioGroupCard
                    key={candidate.id}
                    value={candidate.id}
                    disabled={Boolean(reason)}
                    media={meta && <ProviderIcon icon={meta.icon} alt="" size="sm" />}
                    title={
                      <Inline gap={8} align="center">
                        {candidate.name}
                        <Badge tone="outline">{typeName}</Badge>
                      </Inline>
                    }
                    description={reason ?? candidate.description ?? undefined}
                  />
                );
              })}
            </RadioGroup>
          )}
        </Stack>
      </FieldSet>
    </Stack>
  );

  const detailsStep = template && metadata && (
    <Stack gap={24}>
      <Inset>
        <Inline gap={12} align="center" wrap={false}>
          <ProviderIcon icon={metadata.icon} alt="" size="md" />
          <Stack gap={2}>
            <Inline gap={8} align="center">
              <Text>{template.name}</Text>
              <Badge tone="outline">{metadata.name}</Badge>
            </Inline>
            {template.description && <Meta mono={false}>{template.description}</Meta>}
          </Stack>
        </Inline>
      </Inset>
      <Stack gap={16}>
        <Field label="Name" name="name" error={errors.name}>
          <Input
            autoComplete="off"
            placeholder="My account"
            value={name}
            invalid={Boolean(errors.name)}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: "" }));
            }}
          />
        </Field>
        <Field label="Description" optional error={errors.description}>
          <Textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </Stack>
      <FieldSet legend="Connection details">
        <Stack gap={16}>
          <SchemaFields
            group="connectionDetails"
            metadata={metadata}
            values={values}
            errors={errors}
            onChange={changeField("connectionDetails")}
            onPasteValues={(next) => {
              setValues(applyForcedRules(metadata, next));
              setErrors({});
            }}
          />
          {needsGateway && (
            <Field label="Gateway" error={errors.gateway}>
              <GatewayPicker
                label="Gateway"
                required
                value={gateway}
                invalid={Boolean(errors.gateway)}
                onChange={(next) => {
                  setGateway(next);
                  setErrors((current) => ({ ...current, gateway: "" }));
                }}
              />
            </Field>
          )}
          {needsRecording && (
            <Alert tone="warn" title="S3 recording not configured">
              This account will be created, but stays inaccessible until S3 recording is configured
              on the account or its template.
            </Alert>
          )}
        </Stack>
      </FieldSet>
      {metadata.credentialFields.length > 0 && (
        <FieldSet legend="Credentials">
          <Stack gap={16}>
            <SchemaFields
              group="credentials"
              metadata={metadata}
              values={values}
              errors={errors}
              onChange={changeField("credentials")}
            />
            <SshCaNotice
              accountType={template.type}
              authMethod={values.credentials.authMethod as string | undefined}
            />
          </Stack>
        </FieldSet>
      )}
    </Stack>
  );

  return (
    <>
      <MultiStep
        variant="sheet"
        size="md"
        title="Add account"
        open={open}
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true);
            return;
          }
          if (createdId.current) {
            const id = createdId.current;
            createdId.current = null;
            close();
            onCreated?.(id);
            return;
          }
          if (dirty) {
            setDiscarding(true);
            return;
          }
          close();
        }}
        completeLabel="Create"
        steps={[
          {
            title: "Template",
            content: templateStep,
            disabledReason: templateStepBlocker,
            validate: () => {
              if (
                (template?.type === PamAccountType.Windows ||
                  template?.type === PamAccountType.WindowsAd) &&
                subscription?.enterprisePamAccount === false
              ) {
                openUpgradeGate({
                  intent: EnterprisePamAccountsUpgradeIntent,
                  paywallKey: "pam.enterprise-account"
                });
                return false;
              }
              return true;
            }
          },
          { title: "Details", content: detailsStep, validate: submit }
        ]}
      />
      <DiscardChangesAlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard account setup?"
        description="Your progress creating this account will be lost."
        onDiscard={() => {
          setDiscarding(false);
          close();
        }}
      />
      <CreateFolderDialog
        open={creatingFolder}
        onOpenChange={setCreatingFolder}
        onCreated={(folder) => setFolderId(folder.id)}
      />
      {upgradeGate}
    </>
  );
};

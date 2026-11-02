import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ActivityIcon, BanIcon, HexagonIcon, MapPinIcon, RotateCcwIcon } from "lucide-react";

import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import { SecretValue } from "@app/components/v4/ui/sensitive-editor";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import type { Resource } from "../../secrets-model";
import {
  DEFAULT_MAPPING,
  HONEY_TOKEN_DOCS_URL,
  HONEY_TOKEN_STEP_FIELDS,
  HONEY_TOKEN_STEPS,
  HoneyTokenDetailsFields,
  HoneyTokenMappingFields,
  honeyTokenSchema
} from "../flows/create-honey-token-flow";
import { environmentLabel, LOCAL_ONLY } from "../flows/shared";
import { ProviderLogo, WizardSheet } from "../flows/wizard-sheet";
import type { RowActionHostProps } from "./types";

import styles from "./honey-token-actions.module.css";

type HoneyToken = Extract<Resource, { kind: "honey" }>;

const EDIT_STEPS = HONEY_TOKEN_STEPS.slice(1);
const EDIT_STEP_FIELDS = HONEY_TOKEN_STEP_FIELDS.slice(1);
const CREDENTIAL_FIELDS = [
  { key: "accessKeyId", label: "Access Key ID" },
  { key: "secretAccessKey", label: "Secret Access Key" }
] as const;
const STATUS: Record<HoneyToken["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "ok" },
  triggered: { label: "Triggered", tone: "bad" },
  revoked: { label: "Revoked", tone: "soft" }
};

const isDecoyOf = (token: HoneyToken) => (resource: Resource) =>
  resource.kind === "secret" &&
  Boolean(resource.honeyToken) &&
  resource.project === token.project &&
  resource.environment === token.environment &&
  resource.path === token.path &&
  token.mappedKeys.includes(resource.name);

function EditHoneyTokenSheet({
  token,
  open,
  onOpenChange,
  onSave
}: {
  token: HoneyToken;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: { name: string; description: string; mappedKeys: string[] }) => void;
}) {
  const [draft, setDraft] = useState({
    name: token.name,
    description: token.description,
    secretsMapping: {
      accessKeyId: token.mappedKeys[0] ?? DEFAULT_MAPPING.accessKeyId,
      secretAccessKey: token.mappedKeys[1] ?? DEFAULT_MAPPING.secretAccessKey
    }
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const validate = (index: number) => {
    const parsed = honeyTokenSchema.safeParse({ ...draft, environment: token.environment });
    const issues: Record<string, string> = {};
    if (!parsed.success)
      parsed.error.issues.forEach((issue) => {
        const key = issue.path.join(".");
        if (EDIT_STEP_FIELDS[index].includes(String(issue.path[0])) && !issues[key])
          issues[key] = issue.message;
      });
    setErrors(issues);
    return Object.keys(issues).length === 0;
  };
  const last = step === EDIT_STEPS.length - 1;
  const next = () => {
    if (!validate(step)) return;
    if (!last) {
      setStep(step + 1);
      return;
    }
    onSave({
      name: draft.name.trim(),
      description: draft.description.trim(),
      mappedKeys: [
        draft.secretsMapping.accessKeyId.trim(),
        draft.secretsMapping.secretAccessKey.trim()
      ]
    });
  };
  const back = () => {
    if (step === 0) {
      onOpenChange(false);
      return;
    }
    setErrors({});
    setStep(step - 1);
  };
  const current = EDIT_STEPS[step];
  return (
    <WizardSheet
      open={open}
      onRequestClose={() => onOpenChange(false)}
      media={<ProviderLogo image="Amazon Web Services.png" size={32} />}
      title={
        <span className={styles.titleLink}>
          Edit AWS honey token
          <Button asChild variant="ghost" size="xs" iconRight="external">
            <a href={HONEY_TOKEN_DOCS_URL} target="_blank" rel="noopener noreferrer">
              Docs
            </a>
          </Button>
        </span>
      }
      description="Plant a decoy credential that alerts on access"
      steps={EDIT_STEPS.map((entry) => ({ title: entry.name, summary: entry.shortDescription }))}
      current={step}
      onStepClick={(index) => {
        if (index > step && !validate(step)) return;
        setErrors({});
        setStep(index);
      }}
      heading={current.title}
      subtitle={current.subtitle}
      footer={
        <Inline justify="between">
          <SmallText muted>{`Step ${step + 1} of ${EDIT_STEPS.length}`}</SmallText>
          <Inline gap={12}>
            <Button type="button" variant="outline" onClick={back}>
              Back
            </Button>
            <Button type="button" variant={last ? "primary" : "outline"} onClick={next}>
              {last ? "Update honey token" : "Next"}
            </Button>
          </Inline>
        </Inline>
      }
    >
      <form
        noValidate
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        {current.key === "mapping" && (
          <HoneyTokenMappingFields
            mapping={draft.secretsMapping}
            errors={errors}
            onChange={(secretsMapping) => {
              setDraft((value) => ({ ...value, secretsMapping }));
              setErrors({});
            }}
          />
        )}
        {current.key === "details" && (
          <HoneyTokenDetailsFields
            name={draft.name}
            description={draft.description}
            errors={errors}
            onChange={(value) => {
              setDraft((currentDraft) => ({ ...currentDraft, ...value }));
              if (value.name !== undefined) setErrors({});
            }}
          />
        )}
      </form>
    </WizardSheet>
  );
}

function RevokeHoneyTokenDialog({
  token,
  open,
  onOpenChange,
  onRevoke
}: {
  token: HoneyToken;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRevoke: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={styles.wideDialog} confirmText={token.name}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Are you sure you want to revoke ${token.name}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert tone="bad">
              <AlertDescription>
                This will revoke the AWS IAM credentials and remove the associated decoy secrets
                from this environment. The honey token record and its events will be preserved for
                audit purposes.
              </AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onRevoke}>
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function HoneyTokenEvents({ token }: { token: HoneyToken }) {
  const events = token.events ?? [];
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.muted}>
          <Icon icon={ActivityIcon} />
        </span>
        <p className={styles.sectionTitle}>Events</p>
        {events.length > 0 && <Badge tone="outline">{events.length}</Badge>}
      </div>
      {events.length === 0 ? (
        <EmptyState icon="inbox" title="No events recorded yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>IP address</TableHead>
              <TableHead>User agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const date = new Date(event.createdAt);
              return (
                <TableRow key={event.id}>
                  <TableCell className={styles.nowrap}>
                    <Tooltip content={format(date, "MMMM do, yyyy 'at' h:mm:ss a")}>
                      <span>{formatDistanceToNow(date, { addSuffix: true })}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {event.eventName ? (
                      <Badge tone="outline">{event.eventName}</Badge>
                    ) : (
                      <span className={styles.muted}>None</span>
                    )}
                  </TableCell>
                  <TableCell className={styles.nowrap}>
                    {event.awsRegion ?? <span className={styles.muted}>None</span>}
                  </TableCell>
                  <TableCell className={styles.mono}>
                    {event.sourceIp ?? <span className={styles.muted}>None</span>}
                  </TableCell>
                  <TableCell>
                    {event.userAgent ? (
                      <span className={styles.agent} title={event.userAgent}>
                        {event.userAgent}
                      </span>
                    ) : (
                      <span className={styles.muted}>None</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function HoneyTokenDetailsSheet({
  token,
  credentials,
  open,
  onOpenChange,
  onReset,
  onRevoke
}: {
  token: HoneyToken;
  credentials: Record<string, string | undefined>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
  onRevoke: () => void;
}) {
  const [confirm, setConfirm] = useState<"reset" | "revoke">();
  const isTriggered = token.status === "triggered";
  const isRevoked = token.status === "revoked";
  const created = new Date(token.createdAt);
  const openEvents = token.events?.length ?? 0;
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className={styles.detailsSheet}>
          <SheetHeader>
            <div className={styles.titleRow}>
              <ProviderLogo image="Amazon Web Services.png" size={40} />
              <div className={styles.titleText}>
                <div className={styles.titleLine}>
                  <SheetTitle className={styles.truncate}>{token.name}</SheetTitle>
                  <Badge tone={STATUS[token.status].tone}>
                    {isTriggered && <Icon name="alert" />}
                    {STATUS[token.status].label}
                  </Badge>
                </div>
                <SmallText muted>{token.description || `${token.provider} Token`}</SmallText>
              </div>
            </div>
          </SheetHeader>
          <SheetBody>
            <div className={styles.body}>
              <div className={styles.facts}>
                <div className={styles.badges}>
                  <Tooltip content={format(created, "MMMM do, yyyy 'at' h:mm a")}>
                    <Badge tone="soft">
                      <Icon name="calendar" />
                      {`Created ${formatDistanceToNow(created, { addSuffix: true })}`}
                    </Badge>
                  </Tooltip>
                  <Badge tone="soft">
                    <Icon icon={MapPinIcon} />
                    {environmentLabel(token.environment)}
                    {token.path !== "/" && <span className={styles.mono}>{token.path}</span>}
                  </Badge>
                  <Badge tone="soft">
                    <Icon icon={HexagonIcon} />
                    {`${openEvents} open event${openEvents === 1 ? "" : "s"}`}
                  </Badge>
                  <Badge tone="soft">
                    <Icon name="clock" />
                    {`Active for ${formatDistanceToNow(created)}`}
                  </Badge>
                </div>
                {isRevoked && (
                  <Alert tone="info" title="Honey token revoked">
                    The AWS IAM credentials have been revoked and the decoy secrets removed. The
                    honey token record and its events are preserved for audit purposes.
                  </Alert>
                )}
                {isTriggered && (
                  <Alert tone="warn" title="What to do now?">
                    <p className={styles.paragraph}>
                      If this is a false alarm, reset the honey token to return it to active status
                      and hide past events.
                    </p>
                    <p className={styles.paragraph}>
                      If this activity is suspicious, follow your company&apos;s incident response
                      plan, rotate any real secrets stored alongside the honey token, then revoke
                      and replace the honey token.
                    </p>
                  </Alert>
                )}
              </div>
              {!isRevoked &&
                (CREDENTIAL_FIELDS.some((field) => credentials[field.key]) ? (
                  <div className={styles.credentials}>
                    {CREDENTIAL_FIELDS.map(({ key, label }) => {
                      const value = credentials[key];
                      return (
                        value && (
                          <Field key={key} label={label}>
                            <SecretValue value={value} label={label} />
                          </Field>
                        )
                      );
                    })}
                  </div>
                ) : (
                  <SmallText muted>No credentials available.</SmallText>
                ))}
              <HoneyTokenEvents token={token} />
            </div>
          </SheetBody>
          {!isRevoked && (
            <SheetFooter>
              <Inline justify="between">
                <span>
                  {isTriggered && (
                    <Button variant="outline" onClick={() => setConfirm("reset")}>
                      <Icon icon={RotateCcwIcon} />
                      Reset
                    </Button>
                  )}
                </span>
                <Button variant="destructive" onClick={() => setConfirm("revoke")}>
                  <Icon icon={BanIcon} />
                  Revoke
                </Button>
              </Inline>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={confirm === "reset"}
        onOpenChange={(next) => {
          if (!next) setConfirm(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Icon icon={RotateCcwIcon} size={20} />
            </AlertDialogMedia>
            <AlertDialogTitle>{`Reset ${token.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert the honey token status to active and hide past events. The honey
              token will be able to trigger again on new activity. Its credentials will remain
              unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RevokeHoneyTokenDialog
        token={token}
        open={confirm === "revoke"}
        onOpenChange={(next) => {
          if (!next) setConfirm(undefined);
        }}
        onRevoke={() => {
          setConfirm(undefined);
          onRevoke();
        }}
      />
    </>
  );
}

export function HoneyTokenActions({
  action,
  onClose,
  resources,
  onApply
}: RowActionHostProps<"honey">) {
  const [shown, setShown] = useState(action);
  const [session, setSession] = useState(0);
  if (action && action !== shown) {
    setShown(action);
    setSession(session + 1);
  }
  if (!shown) return null;
  const open = Boolean(action);
  const token =
    resources.find(
      (resource): resource is HoneyToken =>
        resource.kind === "honey" && resource.id === shown.entry.id
    ) ?? shown.entry;
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };
  const revoke = () =>
    onApply(
      (current) =>
        current
          .filter((resource) => !isDecoyOf(token)(resource))
          .map((resource) =>
            resource.kind === "honey" && resource.id === token.id
              ? { ...resource, status: "revoked" as const, updatedAt: new Date().toISOString() }
              : resource
          ),
      {
        title: `Successfully revoked honey token "${token.name}"`,
        description: `${LOCAL_ONLY} No AWS IAM credentials were revoked.`
      }
    );

  if (shown.action === "edit")
    return (
      <EditHoneyTokenSheet
        key={session}
        token={token}
        open={open}
        onOpenChange={onOpenChange}
        onSave={(value) => {
          const renamed = new Map(
            token.mappedKeys.map((key, index) => [key, value.mappedKeys[index] ?? key])
          );
          onApply(
            (current) =>
              current.map((resource) => {
                if (resource.kind === "honey" && resource.id === token.id)
                  return { ...resource, ...value, updatedAt: new Date().toISOString() };
                if (isDecoyOf(token)(resource))
                  return { ...resource, name: renamed.get(resource.name) ?? resource.name };
                return resource;
              }),
            { title: "Successfully updated AWS Honey Token", description: LOCAL_ONLY }
          );
          onClose();
        }}
      />
    );

  if (shown.action === "revoke")
    return (
      <RevokeHoneyTokenDialog
        token={token}
        open={open}
        onOpenChange={onOpenChange}
        onRevoke={() => {
          revoke();
          onClose();
        }}
      />
    );

  const credentials = Object.fromEntries(
    CREDENTIAL_FIELDS.map(({ key }, index) => {
      const secret = resources.find(
        (resource) => isDecoyOf(token)(resource) && resource.name === token.mappedKeys[index]
      );
      return [
        key,
        secret?.kind === "secret" && secret.value.status === "present"
          ? secret.value.value
          : undefined
      ];
    })
  );
  return (
    <HoneyTokenDetailsSheet
      token={token}
      key={session}
      credentials={credentials}
      open={open}
      onOpenChange={onOpenChange}
      onRevoke={revoke}
      onReset={() =>
        onApply(
          (current) =>
            current.map((resource) =>
              resource.kind === "honey" && resource.id === token.id
                ? { ...resource, status: "active" as const, events: [] }
                : resource
            ),
          { title: `Honey token "${token.name}" has been reset`, description: LOCAL_ONLY }
        )
      }
    />
  );
}

import { useId, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Spinner } from "@infisical/cipher/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@infisical/cipher/ui/tabs";

import { CertificateEnrollmentUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import type { TPkiApplicationProfile } from "@app/hooks/api/pkiApplications/types";

import { useProjectScope } from "../../access/project/scope";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import { AcmeEnrollmentPanel } from "./enrollment-acme";
import { ApiEnrollmentPanel } from "./enrollment-api";
import { EstEnrollmentPanel } from "./enrollment-est";
import {
  ENROLLMENT_DOCS,
  ENROLLMENT_METHODS,
  type EnrollmentDrafts,
  type EnrollmentMethod,
  type EnrollmentPanelProps,
  isMethodConfigured,
  METHOD_LABELS
} from "./enrollment-model";
import { MicrosoftAutoenrollmentEnrollmentPanel } from "./enrollment-ms-autoenroll";
import { ScepEnrollmentPanel } from "./enrollment-scep";

export { type EnrollmentMethod, METHOD_LABELS } from "./enrollment-model";

const METHOD_DESCRIPTIONS: Record<EnrollmentMethod, string> = {
  api: "Issue certificates from the UI or programmatically through the API.",
  est: "Enroll enterprise devices and IoT with the EST protocol.",
  acme: "Automate renewal with ACME clients such as Certbot or Caddy.",
  scep: "Provision device certificates through MDM platforms such as Jamf or Intune.",
  "microsoft-autoenrollment": "Enroll domain-joined Windows computers through Group Policy."
};

type EnrollmentSheetProps = {
  applicationId: string;
  projectId: string;
  profile: TPkiApplicationProfile | null;
  initialMethod?: EnrollmentMethod;
  onClose: () => void;
  canCreateConnection: boolean;
};

type AddMenuProps = {
  layout?: "trigger";
  methods: EnrollmentMethod[];
  locked: Partial<Record<EnrollmentMethod, boolean>>;
  unsupported: Partial<Record<EnrollmentMethod, string>>;
  disabled: boolean;
  onAdd: (method: EnrollmentMethod) => void;
};

const AddMethodMenu = ({ layout, methods, locked, unsupported, disabled, onAdd }: AddMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" icon="plus" layout={layout} disabled={disabled}>
        Add method
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {methods.map((method) => (
        <DropdownMenuItem
          key={method}
          description={METHOD_DESCRIPTIONS[method]}
          disabledReason={unsupported[method]}
          onSelect={() => onAdd(method)}
        >
          {METHOD_LABELS[method]}
          {locked[method] && <Badge tone="soft">Enterprise</Badge>}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const EnrollmentHeader = ({
  profileSlug,
  tabsId,
  visible,
  active,
  unsaved,
  disabled,
  onSelect,
  addMenu
}: {
  profileSlug: string;
  tabsId: string;
  visible: EnrollmentMethod[];
  active?: EnrollmentMethod;
  unsaved: ReadonlySet<EnrollmentMethod>;
  disabled: boolean;
  onSelect: (method: EnrollmentMethod) => void;
  addMenu: AddMenuProps;
}) => (
  <SheetHeader
    actions={visible.length > 0 && addMenu.methods.length > 0 && <AddMethodMenu {...addMenu} />}
    tabs={
      visible.length > 0 && (
        <Tabs value={active} onChange={(next) => onSelect(next as EnrollmentMethod)}>
          <TabsList aria-label="Enrollment methods">
            {visible.map((method) => (
              <TabsTrigger
                key={method}
                value={method}
                disabled={disabled}
                id={`${tabsId}-${method}`}
                aria-controls={`${tabsId}-panel`}
              >
                <Inline gap={6} align="center" wrap={false}>
                  {METHOD_LABELS[method]}
                  {unsaved.has(method) && (
                    <Badge tone="warn" size="sm">
                      Unsaved
                    </Badge>
                  )}
                </Inline>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )
    }
  >
    <SheetTitle
      badges={<DocumentationLink href={ENROLLMENT_DOCS.overview} subject="enrollment methods" />}
    >
      Enrollment for {profileSlug}
    </SheetTitle>
  </SheetHeader>
);

type SharedPanelProps = Omit<EnrollmentPanelProps<EnrollmentMethod>, "draft" | "onDraft">;

const MethodPanel = ({
  method,
  drafts,
  setDraft,
  canCreateConnection,
  onUpgradeRequired,
  ...shared
}: SharedPanelProps & {
  method: EnrollmentMethod;
  drafts: EnrollmentDrafts;
  setDraft: <M extends EnrollmentMethod>(method: M, draft: EnrollmentDrafts[M]) => void;
  canCreateConnection: boolean;
  onUpgradeRequired?: () => void;
}) => {
  if (method === "api")
    return (
      <ApiEnrollmentPanel
        {...shared}
        draft={drafts.api}
        onDraft={(draft) => setDraft("api", draft)}
      />
    );
  if (method === "est")
    return (
      <EstEnrollmentPanel
        {...shared}
        draft={drafts.est}
        onDraft={(draft) => setDraft("est", draft)}
      />
    );
  if (method === "acme")
    return (
      <AcmeEnrollmentPanel
        {...shared}
        draft={drafts.acme}
        onDraft={(draft) => setDraft("acme", draft)}
      />
    );
  if (method === "scep")
    return (
      <ScepEnrollmentPanel
        {...shared}
        draft={drafts.scep}
        onDraft={(draft) => setDraft("scep", draft)}
        canCreateConnection={canCreateConnection}
      />
    );
  return (
    <MicrosoftAutoenrollmentEnrollmentPanel
      {...shared}
      draft={drafts["microsoft-autoenrollment"]}
      onDraft={(draft) => setDraft("microsoft-autoenrollment", draft)}
      canCreateConnection={canCreateConnection}
      onUpgradeRequired={onUpgradeRequired}
    />
  );
};

const EnrollmentView = ({
  applicationId,
  projectId,
  profile,
  initialMethod,
  onClose,
  canCreateConnection
}: EnrollmentSheetProps & { profile: TPkiApplicationProfile }) => {
  const adapter = useV4Adapter("pkiApplications");
  const { orgId } = useProjectScope();
  const { profileId, profileSlug } = profile;
  const { data: state, isPending, error } = adapter.useEnrollment(applicationId, profileId);
  const { data: plan } = adapter.useEnrollmentPlan(orgId);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [added, setAdded] = useState<EnrollmentMethod[]>([]);
  const [selected, setSelected] = useState(initialMethod);
  const [drafts, setDrafts] = useState<EnrollmentDrafts>({});
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState<EnrollmentMethod | null>(null);
  const tabsId = useId();

  const configured = new Set(
    state ? ENROLLMENT_METHODS.filter((method) => isMethodConfigured(state, method)) : []
  );
  const visible = ENROLLMENT_METHODS.filter(
    (method) => configured.has(method) || added.includes(method)
  );
  const active = selected && visible.includes(selected) ? selected : visible[0];
  const locked: Partial<Record<EnrollmentMethod, boolean>> = {
    est: plan?.est === false,
    scep: plan?.scep === false,
    "microsoft-autoenrollment": plan?.microsoftAutoenrollment === false
  };
  const unsupported: Partial<Record<EnrollmentMethod, string>> = {
    "microsoft-autoenrollment": state?.microsoftAutoenrollmentUnsupportedReason ?? undefined
  };
  const openMethodUpgradeGate = (method: EnrollmentMethod) =>
    openUpgradeGate({
      intent: CertificateEnrollmentUpgradeIntent,
      paywallKey: `cert-manager.application-enrollment.${method}`
    });

  const closeGuard = useDiscardChangesGuard({
    isDirty: Object.keys(drafts).length > 0,
    onDiscard: onClose
  });

  const forget = (method: EnrollmentMethod) => {
    setAdded((current) => current.filter((entry) => entry !== method));
    setDrafts(({ [method]: _removed, ...rest }) => rest);
  };

  const setDraft = <M extends EnrollmentMethod>(method: M, draft: EnrollmentDrafts[M]) =>
    setDrafts(({ [method]: _previous, ...rest }) =>
      draft === undefined ? rest : { ...rest, [method]: draft }
    );

  const add = (method: EnrollmentMethod) => {
    if (locked[method]) {
      openMethodUpgradeGate(method);
      return;
    }
    setAdded((current) => [...current, method]);
    setSelected(method);
  };

  const run = async <T,>(task: () => Promise<T>) => {
    setBusy(true);
    try {
      return await task();
    } finally {
      setBusy(false);
    }
  };

  const menu = {
    methods: ENROLLMENT_METHODS.filter(
      (method) => !configured.has(method) && !added.includes(method)
    ),
    locked,
    unsupported,
    disabled: busy,
    onAdd: add
  };
  const header = (
    <EnrollmentHeader
      profileSlug={profileSlug}
      tabsId={tabsId}
      disabled={busy}
      visible={visible}
      active={active}
      unsaved={
        new Set(visible.filter((method) => !configured.has(method) || drafts[method] !== undefined))
      }
      onSelect={setSelected}
      addMenu={menu}
    />
  );

  const ready = Boolean(state && active);
  let placeholder = <Spinner label="Loading enrollment" />;
  if (!isPending && (error || !state))
    placeholder = (
      <EmptyState
        size="sm"
        icon="alert"
        title="Couldn't load enrollment"
        description="Close the sheet and try again."
      />
    );
  else if (!isPending)
    placeholder = (
      <EmptyState
        size="sm"
        icon="cert"
        title="No enrollment methods"
        description="Add a method to let clients request certificates from this profile."
        actions={<AddMethodMenu {...menu} layout="trigger" />}
      />
    );

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && closeGuard.requestDiscard()}>
        <SheetContent size="md" pending={busy}>
          {ready && state && active ? (
            <MethodPanel
              method={active}
              drafts={drafts}
              setDraft={setDraft}
              canCreateConnection={canCreateConnection}
              onUpgradeRequired={locked[active] ? () => openMethodUpgradeGate(active) : undefined}
              applicationId={applicationId}
              profileId={profileId}
              profileSlug={profileSlug}
              projectId={projectId}
              state={state}
              header={header}
              body={{
                role: "tabpanel",
                id: `${tabsId}-panel`,
                "aria-labelledby": `${tabsId}-${active}`
              }}
              busy={busy}
              run={run}
              onSaved={() => forget(active)}
              onCancel={() => {
                if (configured.has(active)) closeGuard.requestDiscard();
                else if (drafts[active]) setDiscarding(active);
                else forget(active);
              }}
            />
          ) : (
            <>
              {header}
              <SheetBody>{placeholder}</SheetBody>
              <SheetFooter>
                <Button variant="outline" onClick={closeGuard.requestDiscard}>
                  Close
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...closeGuard.discardDialogProps}
        description="Unsaved enrollment settings will be lost."
      />
      <DiscardChangesAlertDialog
        open={Boolean(discarding)}
        onOpenChange={(open) => !open && setDiscarding(null)}
        onDiscard={() => {
          if (discarding) forget(discarding);
          setDiscarding(null);
        }}
        description={
          discarding
            ? `Unsaved ${METHOD_LABELS[discarding]} enrollment settings will be lost.`
            : undefined
        }
      />
      {upgradeGate}
    </>
  );
};

export const EnrollmentSheet = ({ profile, ...props }: EnrollmentSheetProps) =>
  profile ? <EnrollmentView key={profile.profileId} {...props} profile={profile} /> : null;

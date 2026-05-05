import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Spinner,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea
} from "@app/components/v2";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useToggle } from "@app/hooks";
import { useGetPkiApplicationEnrollment } from "@app/hooks/api/pkiApplications";
import {
  useClearPkiApplicationAcmeEnrollment,
  useClearPkiApplicationApiEnrollment,
  useClearPkiApplicationEstEnrollment,
  useClearPkiApplicationScepEnrollment,
  useRevealPkiApplicationAcmeEabSecret,
  useRotatePkiApplicationAcmeEabSecret,
  useSetPkiApplicationAcmeEnrollment,
  useSetPkiApplicationApiEnrollment,
  useSetPkiApplicationEstEnrollment,
  useSetPkiApplicationScepEnrollment
} from "@app/hooks/api/pkiApplications/mutations";
import { ScepChallengeType, TPkiApplicationProfile } from "@app/hooks/api/pkiApplications/types";

const COPY_RESET_MS = 1000;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  profile: TPkiApplicationProfile | null;
};

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const CopyableField = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useToggle(false);
  return (
    <div>
      <FormLabel label={label} />
      <div className="flex gap-2">
        <Input value={value} disabled />
        <IconButton
          ariaLabel={`copy ${label}`}
          variant="outline_bg"
          colorSchema="secondary"
          className="w-10"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied.on();
            setTimeout(() => setCopied.off(), COPY_RESET_MS);
          }}
        >
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
        </IconButton>
      </div>
    </div>
  );
};

type ApiForm = { autoRenew: boolean; renewBeforeDays?: number };

const ApiPanel = ({
  applicationId,
  profileId,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: { autoRenew: boolean; renewBeforeDays: number | null } | null;
}) => {
  const setMutation = useSetPkiApplicationApiEnrollment();
  const clearMutation = useClearPkiApplicationApiEnrollment();
  const { control, handleSubmit, watch, reset } = useForm<ApiForm>({
    defaultValues: {
      autoRenew: initial?.autoRenew ?? false,
      renewBeforeDays: initial?.renewBeforeDays ?? undefined
    }
  });

  useEffect(() => {
    reset({
      autoRenew: initial?.autoRenew ?? false,
      renewBeforeDays: initial?.renewBeforeDays ?? undefined
    });
  }, [initial?.autoRenew, initial?.renewBeforeDays, reset]);

  const autoRenew = watch("autoRenew");

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({
        applicationId,
        profileId,
        autoRenew: values.autoRenew,
        renewBeforeDays: values.autoRenew ? values.renewBeforeDays : undefined
      });
      createNotification({ type: "success", text: "API enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save API enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      createNotification({ type: "success", text: "API enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable API enrollment")
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        API enrollment lets clients request certificates by calling the project API with this
        profile.
      </p>
      <Controller
        control={control}
        name="autoRenew"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FormLabel label="Auto-renew" />
              <p className="text-xs text-mineshaft-400">
                Automatically renew certificates issued via this profile before they expire.
              </p>
            </div>
            <Switch id="api-auto-renew" isChecked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      {autoRenew && (
        <Controller
          control={control}
          name="renewBeforeDays"
          rules={{ min: 1, max: 365 }}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Renew before (days)"
              isError={Boolean(error)}
              errorText="Must be between 1 and 365"
              helperText="How many days before expiry to trigger renewal."
            >
              <Input
                type="number"
                min={1}
                max={365}
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                }
                placeholder="30"
              />
            </FormControl>
          )}
        />
      )}
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <Button variant="outline" onClick={onDisable} isPending={clearMutation.isPending}>
            Disable
          </Button>
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

type EstForm = { passphrase: string; disableBootstrapCaValidation: boolean; caChain?: string };

const EstPanel = ({
  applicationId,
  profileId,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: { disableBootstrapCaValidation: boolean } | null;
}) => {
  const setMutation = useSetPkiApplicationEstEnrollment();
  const clearMutation = useClearPkiApplicationEstEnrollment();
  const { control, handleSubmit, reset } = useForm<EstForm>({
    defaultValues: {
      passphrase: "",
      disableBootstrapCaValidation: initial?.disableBootstrapCaValidation ?? false,
      caChain: ""
    }
  });

  useEffect(() => {
    reset({
      passphrase: "",
      disableBootstrapCaValidation: initial?.disableBootstrapCaValidation ?? false,
      caChain: ""
    });
  }, [initial?.disableBootstrapCaValidation, reset]);

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({
        applicationId,
        profileId,
        passphrase: values.passphrase,
        disableBootstrapCaValidation: values.disableBootstrapCaValidation,
        caChain: values.caChain || undefined
      });
      createNotification({ type: "success", text: "EST enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save EST enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      createNotification({ type: "success", text: "EST enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable EST enrollment")
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        EST clients will authenticate to this profile with the passphrase below.
      </p>
      <Controller
        control={control}
        name="passphrase"
        rules={{ required: !enabled, minLength: 8 }}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label={enabled ? "New passphrase (leave blank to keep current)" : "Passphrase"}
            isError={Boolean(error)}
            errorText="Minimum 8 characters"
          >
            <Input type="password" {...field} placeholder="••••••••" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="caChain"
        render={({ field }) => (
          <FormControl
            label="CA chain (optional)"
            helperText="PEM-encoded chain returned by the EST endpoint."
          >
            <TextArea {...field} rows={3} placeholder="-----BEGIN CERTIFICATE-----..." />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="disableBootstrapCaValidation"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FormLabel label="Disable bootstrap CA validation" />
              <p className="text-xs text-mineshaft-400">
                Allow EST clients to skip server certificate validation during enrollment.
              </p>
            </div>
            <Switch
              id="est-disable-bootstrap"
              isChecked={field.value}
              onCheckedChange={field.onChange}
            />
          </div>
        )}
      />
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <Button variant="outline" onClick={onDisable} isPending={clearMutation.isPending}>
            Disable
          </Button>
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

type AcmeForm = { skipDnsOwnershipVerification: boolean; skipEabBinding: boolean };

const AcmePanel = ({
  applicationId,
  profileId,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: { skipDnsOwnershipVerification: boolean; skipEabBinding: boolean } | null;
}) => {
  const setMutation = useSetPkiApplicationAcmeEnrollment();
  const clearMutation = useClearPkiApplicationAcmeEnrollment();
  const revealMutation = useRevealPkiApplicationAcmeEabSecret();
  const rotateMutation = useRotatePkiApplicationAcmeEabSecret();
  const [credentials, setCredentials] = useState<{ eabKid: string; eabSecret: string } | null>(
    null
  );
  const { control, handleSubmit, watch, setValue, reset } = useForm<AcmeForm>({
    defaultValues: {
      skipDnsOwnershipVerification: initial?.skipDnsOwnershipVerification ?? false,
      skipEabBinding: initial?.skipEabBinding ?? false
    }
  });

  useEffect(() => {
    reset({
      skipDnsOwnershipVerification: initial?.skipDnsOwnershipVerification ?? false,
      skipEabBinding: initial?.skipEabBinding ?? false
    });
  }, [initial?.skipDnsOwnershipVerification, initial?.skipEabBinding, reset]);

  const skipDns = watch("skipDnsOwnershipVerification");
  const skipEab = watch("skipEabBinding");

  const onSave = handleSubmit(async (values) => {
    if (values.skipDnsOwnershipVerification && values.skipEabBinding) {
      createNotification({
        type: "error",
        text: "Pick at most one of: skip DNS ownership verification, skip EAB binding."
      });
      return;
    }
    try {
      await setMutation.mutateAsync({ applicationId, profileId, ...values });
      createNotification({ type: "success", text: "ACME enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save ACME enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      setCredentials(null);
      createNotification({ type: "success", text: "ACME enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable ACME enrollment")
      });
    }
  };

  const onReveal = async () => {
    try {
      const data = await revealMutation.mutateAsync({ applicationId, profileId });
      setCredentials({ eabKid: data.eabKid, eabSecret: data.eabSecret });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to reveal EAB secret") });
    }
  };

  const onRotate = async () => {
    try {
      await rotateMutation.mutateAsync({ applicationId, profileId });
      const data = await revealMutation.mutateAsync({ applicationId, profileId });
      setCredentials({ eabKid: data.eabKid, eabSecret: data.eabSecret });
      createNotification({ type: "success", text: "ACME EAB secret rotated" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to rotate EAB secret") });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        ACME clients use the EAB credentials below to register an account against this profile.
      </p>
      <p className="text-xs text-mineshaft-400">
        Pick at most one of the two options below — they are mutually exclusive.
      </p>
      <Controller
        control={control}
        name="skipDnsOwnershipVerification"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FormLabel label="Skip DNS ownership verification" />
              <p className="text-xs text-mineshaft-400">
                Skip DNS-01 / HTTP-01 challenge enforcement. Use only inside trusted networks.
              </p>
            </div>
            <Switch
              id="acme-skip-dns"
              isChecked={field.value}
              onCheckedChange={(v) => {
                field.onChange(v);
                if (v) setValue("skipEabBinding", false);
              }}
              isDisabled={skipEab}
            />
          </div>
        )}
      />
      <Controller
        control={control}
        name="skipEabBinding"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FormLabel label="Skip EAB binding" />
              <p className="text-xs text-mineshaft-400">
                Allow accounts to register without an EAB key. Recommended off in production.
              </p>
            </div>
            <Switch
              id="acme-skip-eab"
              isChecked={field.value}
              onCheckedChange={(v) => {
                field.onChange(v);
                if (v) setValue("skipDnsOwnershipVerification", false);
              }}
              isDisabled={skipDns}
            />
          </div>
        )}
      />
      {enabled && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReveal} isPending={revealMutation.isPending}>
            Reveal EAB credentials
          </Button>
          <Button variant="outline" onClick={onRotate} isPending={rotateMutation.isPending}>
            Rotate EAB secret
          </Button>
        </div>
      )}
      {credentials && (
        <div className="space-y-3 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
          <CopyableField label="EAB KID" value={credentials.eabKid} />
          <CopyableField label="EAB Secret" value={credentials.eabSecret} />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <Button variant="outline" onClick={onDisable} isPending={clearMutation.isPending}>
            Disable
          </Button>
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

const ScepPanel = ({
  applicationId,
  profileId,
  enabled,
  initial
}: {
  applicationId: string;
  profileId: string;
  enabled: boolean;
  initial: {
    challengeType: ScepChallengeType;
    includeCaCertInResponse: boolean;
    allowCertBasedRenewal: boolean;
    dynamicChallengeExpiryMinutes: number | null;
    dynamicChallengeMaxPending: number | null;
  } | null;
}) => {
  const setMutation = useSetPkiApplicationScepEnrollment();
  const clearMutation = useClearPkiApplicationScepEnrollment();
  const { control, handleSubmit, watch, reset } = useForm<{
    challengeType: ScepChallengeType;
    challengePassword?: string;
    includeCaCertInResponse: boolean;
    allowCertBasedRenewal: boolean;
    dynamicChallengeExpiryMinutes?: number;
    dynamicChallengeMaxPending?: number;
  }>({
    defaultValues: {
      challengeType: initial?.challengeType ?? "static",
      challengePassword: "",
      includeCaCertInResponse: initial?.includeCaCertInResponse ?? true,
      allowCertBasedRenewal: initial?.allowCertBasedRenewal ?? true,
      dynamicChallengeExpiryMinutes: initial?.dynamicChallengeExpiryMinutes ?? 60,
      dynamicChallengeMaxPending: initial?.dynamicChallengeMaxPending ?? 100
    }
  });

  useEffect(() => {
    reset({
      challengeType: initial?.challengeType ?? "static",
      challengePassword: "",
      includeCaCertInResponse: initial?.includeCaCertInResponse ?? true,
      allowCertBasedRenewal: initial?.allowCertBasedRenewal ?? true,
      dynamicChallengeExpiryMinutes: initial?.dynamicChallengeExpiryMinutes ?? 60,
      dynamicChallengeMaxPending: initial?.dynamicChallengeMaxPending ?? 100
    });
  }, [
    initial?.challengeType,
    initial?.includeCaCertInResponse,
    initial?.allowCertBasedRenewal,
    initial?.dynamicChallengeExpiryMinutes,
    initial?.dynamicChallengeMaxPending,
    reset
  ]);

  const challengeType = watch("challengeType");

  const onSave = handleSubmit(async (values) => {
    try {
      await setMutation.mutateAsync({ applicationId, profileId, ...values });
      createNotification({ type: "success", text: "SCEP enrollment saved" });
    } catch (err) {
      createNotification({ type: "error", text: errorText(err, "Failed to save SCEP enrollment") });
    }
  });

  const onDisable = async () => {
    try {
      await clearMutation.mutateAsync({ applicationId, profileId });
      createNotification({ type: "success", text: "SCEP enrollment disabled" });
    } catch (err) {
      createNotification({
        type: "error",
        text: errorText(err, "Failed to disable SCEP enrollment")
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-mineshaft-300">
        SCEP clients enroll by presenting a challenge password. Use static for shared passwords,
        dynamic for one-time per-client challenges.
      </p>
      <Controller
        control={control}
        name="challengeType"
        render={({ field }) => (
          <FormControl label="Challenge type">
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="static">Static password</SelectItem>
                <SelectItem value="dynamic">Dynamic (per-client)</SelectItem>
              </SelectContent>
            </Select>
          </FormControl>
        )}
      />
      {challengeType === "static" && (
        <Controller
          control={control}
          name="challengePassword"
          rules={{ required: !enabled }}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label={
                enabled
                  ? "New challenge password (leave blank to keep current)"
                  : "Challenge password"
              }
              isError={Boolean(error)}
              errorText="Required"
            >
              <Input type="password" {...field} placeholder="••••••••" />
            </FormControl>
          )}
        />
      )}
      {challengeType === "dynamic" && (
        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={control}
            name="dynamicChallengeExpiryMinutes"
            render={({ field }) => (
              <FormControl label="Challenge expiry (minutes)">
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="dynamicChallengeMaxPending"
            render={({ field }) => (
              <FormControl label="Max pending challenges">
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
              </FormControl>
            )}
          />
        </div>
      )}
      <Controller
        control={control}
        name="includeCaCertInResponse"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FormLabel label="Include CA cert in response" />
              <p className="text-xs text-mineshaft-400">
                Return the issuing CA certificate inline alongside the issued cert.
              </p>
            </div>
            <Switch id="scep-include-ca" isChecked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      <Controller
        control={control}
        name="allowCertBasedRenewal"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4">
            <div>
              <FormLabel label="Allow cert-based renewal" />
              <p className="text-xs text-mineshaft-400">
                Let clients renew using their existing certificate as authentication.
              </p>
            </div>
            <Switch
              id="scep-cert-renewal"
              isChecked={field.value}
              onCheckedChange={field.onChange}
            />
          </div>
        )}
      />
      <div className="flex justify-end gap-2 pt-2">
        {enabled && (
          <Button variant="outline" onClick={onDisable} isPending={clearMutation.isPending}>
            Disable
          </Button>
        )}
        <Button variant="project" onClick={onSave} isPending={setMutation.isPending}>
          {enabled ? "Save" : "Enable"}
        </Button>
      </div>
    </div>
  );
};

export const ConfigureEnrollmentModal = ({
  isOpen,
  onOpenChange,
  applicationId,
  profile
}: Props) => {
  const profileId = profile?.profileId ?? "";
  const { data, isLoading } = useGetPkiApplicationEnrollment(applicationId, profileId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle>
            Configure issuance · <span className="font-mono">{profile?.profileSlug ?? ""}</span>
          </DialogTitle>
          <DialogDescription>
            Enable an enrollment method to allow clients to request certificates from this Profile
            through this Application.
          </DialogDescription>
        </DialogHeader>

        {!profile || isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : (
          <Tabs defaultValue="api">
            <TabList>
              <Tab value="api">
                <span className="inline-flex items-center gap-2">
                  API
                  {data?.api ? <Badge variant="success">on</Badge> : null}
                </span>
              </Tab>
              <Tab value="est">
                <span className="inline-flex items-center gap-2">
                  EST
                  {data?.estConfigured ? <Badge variant="success">on</Badge> : null}
                </span>
              </Tab>
              <Tab value="acme">
                <span className="inline-flex items-center gap-2">
                  ACME
                  {data?.acmeConfigured ? <Badge variant="success">on</Badge> : null}
                </span>
              </Tab>
              <Tab value="scep">
                <span className="inline-flex items-center gap-2">
                  SCEP
                  {data?.scepConfigured ? <Badge variant="success">on</Badge> : null}
                </span>
              </Tab>
            </TabList>
            <TabPanel value="api">
              <ApiPanel
                applicationId={applicationId}
                profileId={profileId}
                enabled={Boolean(data?.api)}
                initial={data?.api ?? null}
              />
            </TabPanel>
            <TabPanel value="est">
              <EstPanel
                applicationId={applicationId}
                profileId={profileId}
                enabled={Boolean(data?.estConfigured)}
                initial={data?.est ?? null}
              />
            </TabPanel>
            <TabPanel value="acme">
              <AcmePanel
                applicationId={applicationId}
                profileId={profileId}
                enabled={Boolean(data?.acmeConfigured)}
                initial={data?.acme ?? null}
              />
            </TabPanel>
            <TabPanel value="scep">
              <ScepPanel
                applicationId={applicationId}
                profileId={profileId}
                enabled={Boolean(data?.scepConfigured)}
                initial={data?.scep ?? null}
              />
            </TabPanel>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

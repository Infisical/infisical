import { ReactNode, useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  FileSignatureIcon,
  HardDriveIcon,
  KeyRoundIcon,
  MonitorIcon,
  TerminalIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  SignerPermissionActions,
  SignerPermissionSub,
  useSignerPermission
} from "@app/context/SignerPermissionContext";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { TSigner, useExportSignerCertificate } from "@app/hooks/api/signers";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import {
  jarsignerConfigSnippet,
  kspCertSnippet,
  kspConfigureSnippet,
  kspDownloadSnippet,
  kspRegisterSnippet,
  kspSignSnippet,
  OS,
  pkcs11ConfigureSnippet,
  pkcs11InstallSnippet,
  pkcs11SignSnippet,
  Pkcs11Tool,
  SignerAuth,
  Snippet
} from "./snippets";

type Props = {
  signer: TSigner;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

enum Method {
  Pkcs11 = "pkcs11",
  Ksp = "ksp"
}

enum AuthMethod {
  Token = "token",
  MachineIdentity = "machine-identity"
}

const STEP_TITLES: Record<1 | 2 | 3, string> = {
  1: "Choose a tool",
  2: "Authentication",
  3: "Install & sign"
};

const CommandBlock = ({ snippet }: { snippet: Snippet }) => {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
    } catch {
      createNotification({ type: "error", text: "Could not copy to clipboard" });
    }
  };

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-xs text-muted">{snippet.language}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 text-xs text-accent transition hover:text-foreground"
        >
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">
        {snippet.code}
      </pre>
    </div>
  );
};

const MethodCard = ({
  icon,
  title,
  description,
  platforms,
  isSelected,
  onSelect
}: {
  icon: ReactNode;
  title: string;
  description: string;
  platforms: string[];
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    aria-pressed={isSelected}
    onClick={onSelect}
    className={cn(
      "flex flex-col gap-3 rounded-lg border p-4 text-left transition",
      isSelected
        ? "border-project bg-project/10 ring-1 ring-project"
        : "border-border bg-card hover:bg-container-hover"
    )}
  >
    <div className="flex items-start justify-between">
      <div className="flex size-9 items-center justify-center rounded-md bg-container text-foreground">
        {icon}
      </div>
      {isSelected && (
        <span className="flex size-5 items-center justify-center rounded-full bg-project/15 text-project">
          <CheckIcon className="size-3" />
        </span>
      )}
    </div>
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-accent">{description}</p>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((p) => (
        <Badge key={p} variant="neutral">
          {p}
        </Badge>
      ))}
    </div>
  </button>
);

const SubStep = ({
  index,
  title,
  description,
  children
}: {
  index: number;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div className="flex gap-3">
    <div className="flex size-6 flex-none items-center justify-center rounded-full border border-project/40 text-xs font-medium text-project">
      {index}
    </div>
    <div className="min-w-0 flex-1 space-y-2 pb-2">
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm text-accent">{description}</p>
      {children}
    </div>
  </div>
);

const AuthOptionCard = ({
  icon,
  title,
  description,
  isSelected,
  onSelect
}: {
  icon: ReactNode;
  title: string;
  description: string;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    aria-pressed={isSelected}
    onClick={onSelect}
    className={cn(
      "flex items-start gap-3 rounded-lg border p-4 text-left transition",
      isSelected
        ? "border-project bg-project/10 ring-1 ring-project"
        : "border-border bg-card hover:bg-container-hover"
    )}
  >
    <div className="flex size-8 flex-none items-center justify-center rounded-md bg-container text-foreground">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-accent">{description}</p>
    </div>
  </button>
);

export const ConnectToSignerDrawer = ({ signer, isOpen, onOpenChange }: Props) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<Method>(Method.Ksp);
  const [os, setOs] = useState<OS>("linux");
  const [tool, setTool] = useState<Pkcs11Tool>("jarsigner");
  const [authMethod, setAuthMethod] = useState<AuthMethod>(AuthMethod.Token);

  useEffect(() => {
    if (isOpen) setStep(1);
  }, [isOpen]);

  const { name, keyAlgorithm } = signer;
  const serverUrl = window.location.origin;

  const { permission } = useSignerPermission();
  const canExportCert =
    Boolean(signer.certificateId) &&
    permission.can(SignerPermissionActions.ExportCertificate, SignerPermissionSub.Signer);

  const { data: signerCert } = useExportSignerCertificate(
    signer.id,
    isOpen && method === Method.Ksp && canExportCert
  );

  const auth: SignerAuth =
    authMethod === AuthMethod.Token
      ? { mode: "token", token: getAuthToken() || "<your-access-token>" }
      : { mode: "machine-identity" };

  const authNote =
    authMethod === AuthMethod.Token ? (
      <p className="mt-2 text-xs text-yellow-600">
        This uses your personal access token, which expires, so this setup is temporary. For
        unattended or CI/CD signing, use a machine identity instead.
      </p>
    ) : (
      <p className="mt-2 text-xs text-accent">
        Replace <span className="font-mono">&lt;client-id&gt;</span> and{" "}
        <span className="font-mono">&lt;client-secret&gt;</span> with your Machine Identity&apos;s
        Universal Auth credentials.
      </p>
    );

  const rightDocHref =
    method === Method.Ksp
      ? PkiDocsUrls.codeSigning.windowsKsp
      : PkiDocsUrls.codeSigning.pkcs11Module;

  const renderRightPanel = () => {
    if (step === 1) {
      return (
        <>
          <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pick the tool you already sign with.{" "}
            <span className="font-medium">Standard signing tools</span> like jarsigner,
            osslsigncode, and cosign work on Linux, macOS, and Windows.{" "}
            <span className="font-medium">Windows signtool</span> is native Authenticode signing on
            Windows. Either way, the private key stays in Infisical.
          </p>
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Choose how the signing machine logs in to Infisical.{" "}
            <span className="font-medium">Your own access token</span> is quickest, but it is
            temporary because tokens expire. A <span className="font-medium">machine identity</span>{" "}
            is best for unattended or CI/CD signing.
          </p>
        </>
      );
    }
    return (
      <>
        <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
        {method === Method.Ksp ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Download and register the Key Storage Provider once per machine, set your credentials,
            then sign with <span className="font-mono text-xs">signtool</span>. The Signer is
            selected by name with <span className="font-mono text-xs">/kc</span>.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Download the module, point a config file at it, and set your credentials. Then run your
            tool against this Signer by name: <span className="font-mono text-xs">{name}</span>.
          </p>
        )}
      </>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-screen flex-col gap-0 p-0 sm:max-w-5xl">
        <SheetHeader className="flex-row items-center gap-3 border-b">
          <div className="flex size-10 flex-none items-center justify-center rounded-md border border-project/40 bg-project/10 text-project">
            <FileSignatureIcon className="size-5" />
          </div>
          <div className="flex-1">
            <SheetTitle className="flex items-center gap-2 text-lg">
              Set up signing for {name}
              <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.connect} />
            </SheetTitle>
            <SheetDescription>
              Sign with this Signer using the tool you already use.
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Setup steps
            </p>
            <Stepper
              activeStep={step - 1}
              orientation="vertical"
              onStepChange={(i) => {
                if (i < step - 1) setStep((i + 1) as 1 | 2 | 3);
              }}
            >
              <StepperList>
                <StepperStep index={0} title="Choose a tool" description="What you sign with" />
                <StepperStep index={1} title="Authentication" description="How you log in" />
                <StepperStep index={2} title="Install & sign" description="Set up your machine" />
              </StepperList>
            </Stepper>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold text-foreground">Choose your signing tool</h2>
                <p className="mt-1 mb-6 text-sm text-muted">
                  Pick the tool you already sign with. Infisical plugs into it, so your build keeps
                  working the same way.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <MethodCard
                    icon={<TerminalIcon className="size-5" />}
                    title="Standard signing tools"
                    description="jarsigner, osslsigncode, cosign, and other common tools. Uses the Infisical PKCS#11 module."
                    platforms={["Linux", "macOS", "Windows"]}
                    isSelected={method === Method.Pkcs11}
                    onSelect={() => setMethod(Method.Pkcs11)}
                  />
                  <MethodCard
                    icon={<MonitorIcon className="size-5" />}
                    title="Windows signtool"
                    description="Native Windows Authenticode signing with Microsoft signtool. Uses the Infisical Key Storage Provider."
                    platforms={["Windows"]}
                    isSelected={method === Method.Ksp}
                    onSelect={() => setMethod(Method.Ksp)}
                  />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold text-foreground">
                  Choose how you authenticate
                </h2>
                <p className="mt-1 mb-6 text-sm text-muted">
                  Pick how the signing tool proves who it is to Infisical during signing operations.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <AuthOptionCard
                    icon={<KeyRoundIcon className="size-4" />}
                    title="Use my credentials"
                    description="Sign as yourself with your own Infisical access token. Quickest to set up, but temporary because the token expires."
                    isSelected={authMethod === AuthMethod.Token}
                    onSelect={() => setAuthMethod(AuthMethod.Token)}
                  />
                  <AuthOptionCard
                    icon={<HardDriveIcon className="size-4" />}
                    title="Use a machine identity"
                    description="Authenticate with a Machine Identity's Universal Auth credentials. Best for CI/CD and unattended signing."
                    isSelected={authMethod === AuthMethod.MachineIdentity}
                    onSelect={() => setAuthMethod(AuthMethod.MachineIdentity)}
                  />
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="text-lg font-semibold text-foreground">Install &amp; sign</h2>
                <p className="mt-1 mb-6 text-sm text-muted">
                  {method === Method.Ksp
                    ? "Install the Infisical Key Storage Provider, then sign with Microsoft signtool."
                    : "Install the Infisical PKCS#11 module, then sign with jarsigner, osslsigncode, or any PKCS#11 tool."}
                </p>

                {method === Method.Ksp ? (
                  <div className="space-y-5">
                    <SubStep
                      index={1}
                      title="Download the provider"
                      description="Download the Key Storage Provider DLL for 64-bit Windows."
                    >
                      <CommandBlock snippet={kspDownloadSnippet()} />
                    </SubStep>
                    <SubStep
                      index={2}
                      title="Register with Windows"
                      description="Copies the DLL into System32 and adds the registry entries. Run as Administrator once per machine, then reboot so Windows loads it. Signing also needs signtool, from the Windows SDK."
                    >
                      <CommandBlock snippet={kspRegisterSnippet()} />
                    </SubStep>
                    <SubStep
                      index={3}
                      title="Configure"
                      description={
                        authMethod === AuthMethod.Token
                          ? "Set your Infisical address and access token as environment variables."
                          : "Set your Infisical address and Machine Identity credentials as environment variables."
                      }
                    >
                      <CommandBlock snippet={kspConfigureSnippet(serverUrl, auth)} />
                      {authNote}
                    </SubStep>
                    <SubStep
                      index={4}
                      title="Add the Signer's certificate"
                      description="The certificate is filled in below. Run this to save it; signtool reads it with /f."
                    >
                      {canExportCert ? (
                        <CommandBlock snippet={kspCertSnippet(name, signerCert?.certificatePem)} />
                      ) : (
                        <p className="text-sm text-accent">
                          You need the Export Certificate permission to view this certificate. Ask a
                          Signer Administrator to export it for you.
                        </p>
                      )}
                    </SubStep>
                    <SubStep
                      index={5}
                      title="Sign"
                      description="The Signer is selected by name with /kc."
                    >
                      <CommandBlock snippet={kspSignSnippet(name)} />
                    </SubStep>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <SubStep
                      index={1}
                      title="Install the module"
                      description="Download and extract the module for your platform from the GitHub releases page. It unpacks to libinfisical-pkcs11-<os>-<arch>; use that path wherever a module path is needed below."
                    >
                      <Tabs value={os} onValueChange={(v) => setOs(v as OS)}>
                        <TabsList variant="filled">
                          <TabsTrigger value="linux">Linux</TabsTrigger>
                          <TabsTrigger value="macos">macOS</TabsTrigger>
                          <TabsTrigger value="windows">Windows</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <CommandBlock snippet={pkcs11InstallSnippet(os)} />
                    </SubStep>
                    <SubStep
                      index={2}
                      title="Configure"
                      description={
                        authMethod === AuthMethod.Token
                          ? "Set your Infisical address and access token as environment variables."
                          : "Set your Infisical address and Machine Identity credentials as environment variables."
                      }
                    >
                      <CommandBlock snippet={pkcs11ConfigureSnippet(os, serverUrl, auth)} />
                      {authNote}
                    </SubStep>
                    <SubStep
                      index={3}
                      title="Sign"
                      description="Sign with your tool. The Signer is selected by its name."
                    >
                      <Tabs value={tool} onValueChange={(v) => setTool(v as Pkcs11Tool)}>
                        <TabsList variant="filled">
                          <TabsTrigger value="jarsigner">jarsigner</TabsTrigger>
                          <TabsTrigger value="osslsigncode">osslsigncode</TabsTrigger>
                          <TabsTrigger value="pkcs11-tool">pkcs11-tool</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {tool === "jarsigner" && (
                        <>
                          <p className="text-xs text-muted">
                            First, point a SunPKCS11 config at the module:
                          </p>
                          <CommandBlock snippet={jarsignerConfigSnippet(os)} />
                        </>
                      )}
                      <CommandBlock snippet={pkcs11SignSnippet(tool, name, keyAlgorithm)} />
                    </SubStep>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
            <div className="mb-auto">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  Step {step} · {STEP_TITLES[step]}
                </p>
                <DocumentationLinkBadge
                  href={step === 3 ? rightDocHref : PkiDocsUrls.codeSigning.connect}
                />
              </div>
              {renderRightPanel()}
            </div>
          </aside>
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t">
          <span className="text-sm text-muted">Step {step} of 3</span>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((step - 1) as 1 | 2 | 3)}>
                <ChevronLeftIcon />
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button variant="project" onClick={() => setStep((step + 1) as 1 | 2 | 3)}>
                Continue
              </Button>
            ) : (
              <Button variant="project" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

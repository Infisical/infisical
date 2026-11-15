import { type ReactNode, useState } from "react";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Tabs } from "@infisical/cipher/ui/tabs";

import type { TSigner } from "@app/hooks/api/signers/types";

import { Muted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { CODE_SIGNING_DOCS } from "../CodeSigningPage/signer-shared";
import {
  jarsignerConfigSnippet,
  kspCertSnippet,
  kspConfigureSnippet,
  kspDownloadSnippet,
  kspRegisterSnippet,
  kspSignSnippet,
  type OS,
  pkcs11ConfigureSnippet,
  pkcs11InstallSnippet,
  pkcs11SignSnippet,
  type Pkcs11Tool,
  type SignerAuth,
  type Snippet
} from "./snippets";

type Method = "pkcs11" | "ksp";
type AuthMethod = "token" | "machine-identity";

const Command = ({ snippet }: { snippet: Snippet }) => (
  <CodeBlock label={snippet.language} code={snippet.code} copyable />
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
  <Field group label={`${index}. ${title}`} description={description}>
    <Stack gap={8}>{children}</Stack>
  </Field>
);

export const ConnectSignerSheet = ({
  signer,
  canExportCertificate,
  onClose
}: {
  signer: TSigner;
  canExportCertificate: boolean;
  onClose: () => void;
}) => {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method>("ksp");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("token");
  const [os, setOs] = useState<OS>("linux");
  const [tool, setTool] = useState<Pkcs11Tool>("jarsigner");
  const token = useV4Adapter("org").getSessionToken();
  const canExport = Boolean(signer.certificateId) && canExportCertificate;
  const { data: certificate } = useV4Adapter("codeSigning").useSignerCertificate(
    signer.id,
    method === "ksp" && canExport
  );
  const serverUrl = window.location.origin;
  const auth: SignerAuth =
    authMethod === "token"
      ? { mode: "token", token: token || "<your-access-token>" }
      : { mode: "machine-identity" };
  const authNote =
    authMethod === "token"
      ? "This uses your personal access token, which expires, so this setup is temporary. For unattended or CI/CD signing, use a machine identity instead."
      : "Replace <client-id> and <client-secret> with your machine identity's Universal Auth credentials.";
  const configureDescription =
    authMethod === "token"
      ? "Set your Infisical address and access token as environment variables."
      : "Set your Infisical address and machine identity credentials as environment variables.";

  return (
    <MultiStep
      variant="sheet"
      size="lg"
      title={`Set up signing for ${signer.name}`}
      description={<DocumentationLink href={CODE_SIGNING_DOCS.connect} subject="Code signing" />}
      open
      step={step}
      onStepChange={setStep}
      onOpenChange={(next) => !next && onClose()}
      completeLabel="Done"
      onComplete={onClose}
      steps={[
        {
          title: "Choose a tool",
          heading: "Choose your signing tool",
          summary: method === "ksp" ? "Windows signtool" : "Standard signing tools",
          description:
            "Infisical plugs into the tool you already sign with, and the private key stays in Infisical.",
          content: (
            <RadioGroup
              columns={2}
              aria-label="Signing tool"
              value={method}
              onValueChange={(next) => setMethod(next as Method)}
            >
              <RadioGroupCard
                value="pkcs11"
                media={<Icon name="terminal" />}
                title="Standard signing tools"
                description="jarsigner, osslsigncode, cosign and other common tools on Linux, macOS and Windows, through the Infisical PKCS#11 module."
              />
              <RadioGroupCard
                value="ksp"
                media={<Icon name="monitor" />}
                title="Windows signtool"
                description="Native Windows Authenticode signing with Microsoft signtool, through the Infisical Key Storage Provider."
              />
            </RadioGroup>
          )
        },
        {
          title: "Authentication",
          heading: "Choose how you authenticate",
          summary: authMethod === "token" ? "Your credentials" : "Machine identity",
          content: (
            <RadioGroup
              columns={2}
              aria-label="Authentication"
              value={authMethod}
              onValueChange={(next) => setAuthMethod(next as AuthMethod)}
            >
              <RadioGroupCard
                value="token"
                media={<Icon name="key" />}
                title="Use my credentials"
                description="Sign as yourself with your own access token. Quickest to set up, but temporary because the token expires."
              />
              <RadioGroupCard
                value="machine-identity"
                media={<Icon name="machine" />}
                title="Use a machine identity"
                description="Authenticate with a machine identity's Universal Auth credentials. Best for CI/CD and unattended signing."
              />
            </RadioGroup>
          )
        },
        {
          title: "Install and sign",
          description: (
            <DocumentationLink
              href={method === "ksp" ? CODE_SIGNING_DOCS.ksp : CODE_SIGNING_DOCS.pkcs11}
              subject={method === "ksp" ? "Windows Key Storage Provider" : "PKCS#11 module"}
            />
          ),
          content:
            method === "ksp" ? (
              <Stack gap={24}>
                <SubStep
                  index={1}
                  title="Download the provider"
                  description="Download the Key Storage Provider DLL for 64-bit Windows."
                >
                  <Command snippet={kspDownloadSnippet()} />
                </SubStep>
                <SubStep
                  index={2}
                  title="Register with Windows"
                  description="Copies the DLL into System32 and adds the registry entries. Run as Administrator once per machine, then reboot so Windows loads it. Signing also needs signtool, from the Windows SDK."
                >
                  <Command snippet={kspRegisterSnippet()} />
                </SubStep>
                <SubStep index={3} title="Configure" description={configureDescription}>
                  <Command snippet={kspConfigureSnippet(serverUrl, auth)} />
                  <Muted>{authNote}</Muted>
                </SubStep>
                <SubStep
                  index={4}
                  title="Add the signer's certificate"
                  description="Run this to save the certificate. signtool reads it with /f."
                >
                  {canExport ? (
                    <Command snippet={kspCertSnippet(signer.name, certificate?.certificatePem)} />
                  ) : (
                    <Muted>
                      You need the Export certificate permission to see this certificate. Ask a
                      signer administrator to export it for you.
                    </Muted>
                  )}
                </SubStep>
                <SubStep
                  index={5}
                  title="Sign"
                  description="The signer is selected by name with /kc."
                >
                  <Command snippet={kspSignSnippet(signer.name)} />
                </SubStep>
              </Stack>
            ) : (
              <Stack gap={24}>
                <SubStep
                  index={1}
                  title="Install the module"
                  description="Download and extract the module for your platform. It unpacks to libinfisical-pkcs11-<os>-<arch>, which is the module path used below."
                >
                  <Tabs
                    variant="segmented"
                    label="Platform"
                    value={os}
                    onValueChange={(next) => setOs(next as OS)}
                    tabs={[
                      { value: "linux", label: "Linux" },
                      { value: "macos", label: "macOS" },
                      { value: "windows", label: "Windows" }
                    ]}
                  />
                  <Command snippet={pkcs11InstallSnippet(os)} />
                </SubStep>
                <SubStep index={2} title="Configure" description={configureDescription}>
                  <Command snippet={pkcs11ConfigureSnippet(os, serverUrl, auth)} />
                  <Muted>{authNote}</Muted>
                </SubStep>
                <SubStep
                  index={3}
                  title="Sign"
                  description="Sign with your tool. The signer is selected by its name."
                >
                  <Tabs
                    variant="segmented"
                    label="Signing tool"
                    value={tool}
                    onValueChange={(next) => setTool(next as Pkcs11Tool)}
                    tabs={[
                      { value: "jarsigner", label: "jarsigner" },
                      { value: "osslsigncode", label: "osslsigncode" },
                      { value: "pkcs11-tool", label: "pkcs11-tool" }
                    ]}
                  />
                  {tool === "jarsigner" && (
                    <>
                      <Muted>First, point a SunPKCS11 config at the module.</Muted>
                      <Command snippet={jarsignerConfigSnippet(os)} />
                    </>
                  )}
                  <Command snippet={pkcs11SignSnippet(tool, signer.name, signer.keyAlgorithm)} />
                </SubStep>
              </Stack>
            )
        }
      ]}
    />
  );
};

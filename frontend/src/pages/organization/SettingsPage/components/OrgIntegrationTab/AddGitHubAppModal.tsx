import crypto from "crypto";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faArrowRight, faFileImport, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent, TextArea } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useRegisterGitHubApp } from "@app/hooks/api/gitHubApps";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
};

enum WizardSteps {
  SelectPlatform = "select-platform",
  SelectMethod = "select-method",
  GitHubManifest = "github-manifest",
  GitHubManual = "github-manual"
}

const PLATFORM_LIST = [
  {
    icon: <FontAwesomeIcon icon={faGithub} size="lg" />,
    platform: "github",
    title: "GitHub"
  }
];

const manifestFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  organization: z.string().trim().optional()
});

const manualFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  appId: z.string().trim().min(1, "App ID is required"),
  slug: z.string().trim().min(1, "Slug is required"),
  clientId: z.string().trim().min(1, "Client ID is required"),
  clientSecret: z.string().trim().min(1, "Client secret is required"),
  privateKey: z.string().trim().min(1, "Private key is required")
});

type TManifestFormData = z.infer<typeof manifestFormSchema>;
type TManualFormData = z.infer<typeof manualFormSchema>;

const buildGitHubManifest = ({ orgId, name }: { orgId: string; name: string }) => {
  const redirectUrl = `${window.location.origin}/organizations/${orgId}/settings/github-app/callback`;

  return {
    name,
    url: window.location.origin,
    redirect_url: redirectUrl,
    callback_urls: [`${window.location.origin}/organization/app-connections/github/oauth/callback`],
    description: `Infisical GitHub App for organization ${orgId}`,
    public: false,
    request_oauth_on_install: true,
    default_permissions: {
      metadata: "read",
      secrets: "write",
      environments: "write",
      actions: "read",
      organization_secrets: "write"
    },
    default_events: [] as string[]
  };
};

const submitManifestForm = ({
  orgId,
  name,
  organization
}: {
  orgId: string;
  name: string;
  organization?: string;
}) => {
  const csrfToken = crypto.randomBytes(32).toString("hex");
  localStorage.setItem("githubManifestState", csrfToken);
  localStorage.setItem("githubManifestFormData", JSON.stringify({ name, orgId }));

  const manifest = buildGitHubManifest({ orgId, name });

  const form = document.createElement("form");
  form.method = "post";
  const baseUrl = organization
    ? `https://github.com/organizations/${organization}/settings/apps/new`
    : "https://github.com/settings/apps/new";
  form.action = `${baseUrl}?state=${encodeURIComponent(csrfToken)}`;

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "manifest";
  input.value = JSON.stringify(manifest);
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
};

export const AddGitHubAppModal = ({ isOpen, onToggle }: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectPlatform);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const { currentOrg } = useOrganization();

  const registerGitHubApp = useRegisterGitHubApp();

  const manifestForm = useForm<TManifestFormData>({
    resolver: zodResolver(manifestFormSchema)
  });

  const manualForm = useForm<TManualFormData>({
    resolver: zodResolver(manualFormSchema)
  });

  const handleFormReset = (state: boolean = false) => {
    onToggle(state);
    setWizardStep(WizardSteps.SelectPlatform);
    setSelectedPlatform(null);
    manifestForm.reset();
    manualForm.reset();
  };

  const handleSubmitManifest = ({ name, organization }: TManifestFormData) => {
    if (!currentOrg) return;
    submitManifestForm({ orgId: currentOrg.id, name, organization });
  };

  const handleSubmitManual = async (data: TManualFormData) => {
    if (!currentOrg) return;

    await registerGitHubApp.mutateAsync(data, {
      onSuccess: () => {
        createNotification({ type: "success", text: "GitHub App registered successfully." });
        handleFormReset(false);
      },
      onError: (err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to register GitHub App. Please try again.";
        createNotification({ type: "error", text: message });
      }
    });
  };

  const getModalTitle = () => {
    if (wizardStep === WizardSteps.GitHubManifest) return "Create a new GitHub App";
    if (wizardStep === WizardSteps.GitHubManual) return "Register an existing GitHub App";
    if (selectedPlatform === "github") return "Add a GitHub App";
    return "Add an app integration";
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(state) => handleFormReset(state)}>
      <ModalContent title={getModalTitle()} className="my-4">
        <AnimatePresence mode="wait">
          {wizardStep === WizardSteps.SelectPlatform && (
            <motion.div
              key="select-platform"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-mineshaft-300">Select a platform</div>
              <div className="flex items-center space-x-4">
                {PLATFORM_LIST.map(({ icon, platform, title }) => (
                  <div
                    key={platform}
                    className="flex h-28 w-32 cursor-pointer flex-col items-center space-y-4 rounded-sm border border-mineshaft-500 bg-bunker-600 p-6 transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-white"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedPlatform(platform);
                      setWizardStep(WizardSteps.SelectMethod);
                    }}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter") {
                        setSelectedPlatform(platform);
                        setWizardStep(WizardSteps.SelectMethod);
                      }
                    }}
                  >
                    <div>{icon}</div>
                    <div className="text-center text-sm whitespace-pre-wrap">{title}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {wizardStep === WizardSteps.SelectMethod && selectedPlatform === "github" && (
            <motion.div
              key="select-method"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-mineshaft-300">How would you like to add a GitHub App?</div>
              <div className="flex flex-col space-y-3">
                <div
                  className="flex cursor-pointer items-start space-x-4 rounded-md border border-mineshaft-500 bg-bunker-600 p-4 transition-all hover:border-primary/70 hover:bg-primary/10"
                  role="button"
                  tabIndex={0}
                  onClick={() => setWizardStep(WizardSteps.GitHubManifest)}
                  onKeyDown={(evt) => {
                    if (evt.key === "Enter") setWizardStep(WizardSteps.GitHubManifest);
                  }}
                >
                  <div className="mt-0.5 text-primary">
                    <FontAwesomeIcon icon={faPlusCircle} size="lg" />
                  </div>
                  <div>
                    <div className="font-medium text-mineshaft-100">Create via GitHub Manifest</div>
                    <div className="mt-1 text-sm text-mineshaft-400">
                      Let Infisical guide you through creating a new GitHub App directly on GitHub.
                      Recommended for new setups.
                    </div>
                  </div>
                  <div className="ml-auto self-center text-mineshaft-400">
                    <FontAwesomeIcon icon={faArrowRight} />
                  </div>
                </div>
                <div
                  className="flex cursor-pointer items-start space-x-4 rounded-md border border-mineshaft-500 bg-bunker-600 p-4 transition-all hover:border-primary/70 hover:bg-primary/10"
                  role="button"
                  tabIndex={0}
                  onClick={() => setWizardStep(WizardSteps.GitHubManual)}
                  onKeyDown={(evt) => {
                    if (evt.key === "Enter") setWizardStep(WizardSteps.GitHubManual);
                  }}
                >
                  <div className="mt-0.5 text-primary">
                    <FontAwesomeIcon icon={faFileImport} size="lg" />
                  </div>
                  <div>
                    <div className="font-medium text-mineshaft-100">Register Existing App</div>
                    <div className="mt-1 text-sm text-mineshaft-400">
                      Already have a GitHub App? Provide its credentials to register it with
                      Infisical.
                    </div>
                  </div>
                  <div className="ml-auto self-center text-mineshaft-400">
                    <FontAwesomeIcon icon={faArrowRight} />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Button variant="outline_bg" onClick={() => setWizardStep(WizardSteps.SelectPlatform)}>
                  Back
                </Button>
              </div>
            </motion.div>
          )}
          {wizardStep === WizardSteps.GitHubManifest && selectedPlatform === "github" && (
            <motion.div
              key="github-manifest"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-xs text-mineshaft-200">
                The GitHub App Manifest flow lets you create a new GitHub App without manually
                configuring its settings. Infisical will redirect you to GitHub, where you can
                review and approve the app configuration. Once created, you can install the app on
                any of your GitHub organizations and use it as the basis for GitHub App connections
                in Infisical.
              </div>
              <form
                onSubmit={manifestForm.handleSubmit(handleSubmitManifest)}
                autoComplete="off"
              >
                <Controller
                  control={manifestForm.control}
                  name="name"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="GitHub App name"
                      helperText="Used as the GitHub App's display name. Must be unique within this organization."
                      isRequired
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input placeholder="My Company GitHub App" {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={manifestForm.control}
                  name="organization"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="GitHub Organization"
                      helperText="Optional. If set, the app will be registered under this GitHub organization."
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input placeholder="my-github-org" {...field} />
                    </FormControl>
                  )}
                />
                <div className="mt-6 flex items-center space-x-4">
                  <Button
                    type="submit"
                    isLoading={manifestForm.formState.isSubmitting}
                    isDisabled={manifestForm.formState.isSubmitting}
                  >
                    Create GitHub App on GitHub →
                  </Button>
                  <Button
                    variant="outline_bg"
                    onClick={() => setWizardStep(WizardSteps.SelectMethod)}
                  >
                    Back
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
          {wizardStep === WizardSteps.GitHubManual && selectedPlatform === "github" && (
            <motion.div
              key="github-manual"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-xs text-mineshaft-200">
                Provide your existing GitHub App credentials. These will be securely encrypted and
                stored in Infisical.
              </div>
              <form
                onSubmit={manualForm.handleSubmit(handleSubmitManual)}
                autoComplete="off"
              >
                <Controller
                  control={manualForm.control}
                  name="name"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Display name"
                      helperText="A name to identify this app in Infisical. Must be unique within this organization."
                      isRequired
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input placeholder="My Company GitHub App" {...field} />
                    </FormControl>
                  )}
                />
                <div className="flex space-x-3">
                  <Controller
                    control={manualForm.control}
                    name="appId"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        className="flex-1"
                        label="App ID"
                        isRequired
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Input placeholder="123456" {...field} />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={manualForm.control}
                    name="slug"
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        className="flex-1"
                        label="App slug"
                        isRequired
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Input placeholder="my-company-github-app" {...field} />
                      </FormControl>
                    )}
                  />
                </div>
                <Controller
                  control={manualForm.control}
                  name="clientId"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Client ID"
                      isRequired
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input placeholder="Iv1.a1b2c3d4e5f6g7h8" {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={manualForm.control}
                  name="clientSecret"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Client secret"
                      isRequired
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input type="password" placeholder="••••••••••••••••" {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={manualForm.control}
                  name="privateKey"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Private key"
                      helperText="The PEM-encoded private key generated for your GitHub App."
                      isRequired
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <TextArea
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                        className="h-28 font-mono text-xs"
                        {...field}
                      />
                    </FormControl>
                  )}
                />
                <div className="mt-6 flex items-center space-x-4">
                  <Button
                    type="submit"
                    isLoading={manualForm.formState.isSubmitting || registerGitHubApp.isPending}
                    isDisabled={manualForm.formState.isSubmitting || registerGitHubApp.isPending}
                  >
                    Register GitHub App
                  </Button>
                  <Button
                    variant="outline_bg"
                    onClick={() => setWizardStep(WizardSteps.SelectMethod)}
                  >
                    Back
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};

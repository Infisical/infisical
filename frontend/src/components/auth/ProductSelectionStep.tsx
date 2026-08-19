import { useRef, useState } from "react";
import { Check } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { EXAMPLE_PROJECT_NAME } from "@app/const";
import { isInfisicalCloud } from "@app/helpers/platform";
import { ensureExampleSecrets, initProjectHelper } from "@app/helpers/project";
import { submitSignupOnboarding } from "@app/hooks/api/auth/queries";
import { createWorkspace, fetchUserWorkspaces } from "@app/hooks/api/projects/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

import { AuthPagePanel } from "./AuthPagePanel";
import {
  EXPLORING_SELECTION,
  getSignupProduct,
  SIGNUP_PRODUCTS,
  SignupProductSelection,
  SignupProductType
} from "./signupProducts";

interface ProductSelectionStepProps {
  onComplete: (
    products: SignupProductType[],
    projects: Partial<Record<SignupProductType, Project>>
  ) => void;
}

const setUpProduct = async (product: SignupProductType): Promise<Project | undefined> => {
  // PAM pages are org-scoped; there is no project to create.
  if (product === ProjectType.PAM) return undefined;

  // Locate before creating: a retry after a lost response or a mid-flow refresh can arrive
  // with the project already created (cert-manager is even bootstrapped server-side), and the
  // org is brand new, so any existing project of the type belongs to this flow.
  const [existingProject] = await fetchUserWorkspaces(false, product);
  if (existingProject) {
    // A prior attempt can have died between creating this project and seeding its
    // example secrets; finish the seeding before treating the product as set up.
    if (product === ProjectType.SecretManager) {
      await ensureExampleSecrets(existingProject.id);
    }
    return existingProject;
  }

  switch (product) {
    case ProjectType.SecretManager:
      return initProjectHelper({ projectName: EXAMPLE_PROJECT_NAME });
    case ProjectType.CertificateManager: {
      const { data } = await createWorkspace({
        projectName: "Certificate Manager",
        type: ProjectType.CertificateManager
      });
      return data.project;
    }
    default: {
      const { data } = await createWorkspace({
        projectName: EXAMPLE_PROJECT_NAME,
        type: product
      });
      return data.project;
    }
  }
};

export default function ProductSelectionStep({
  onComplete
}: ProductSelectionStepProps): JSX.Element {
  const [selectedTypes, setSelectedTypes] = useState<SignupProductType[]>([]);
  const [isSettingUp, setIsSettingUp] = useState(false);
  // Survives failed attempts so a retry only sets up the products still missing.
  const createdProjectsRef = useRef<Partial<Record<SignupProductType, Project>>>({});

  const toggleProduct = (product: SignupProductType) => {
    setSelectedTypes((current) =>
      current.includes(product) ? current.filter((type) => type !== product) : [...current, product]
    );
  };

  // Keep the platform's canonical product order regardless of click order.
  const orderedSelection = SIGNUP_PRODUCTS.filter((product) =>
    selectedTypes.includes(product.type)
  ).map((product) => product.type);
  // An empty selection means "just exploring".
  const isExploring = orderedSelection.length === 0;

  const handleContinue = async () => {
    if (isSettingUp) return;

    setIsSettingUp(true);
    let failedProduct: string | undefined;
    try {
      const projects = createdProjectsRef.current;
      // Projects are set up one at a time so a failure points at a specific product.
      // eslint-disable-next-line no-restricted-syntax
      for (const type of orderedSelection) {
        if (!(type in projects)) {
          failedProduct = getSignupProduct(type)?.name;
          // eslint-disable-next-line no-await-in-loop
          projects[type] = await setUpProduct(type);
        }
      }

      // One summary event for the whole selection, plus one per-product event for breakdowns.
      submitSignupOnboarding({ selectedProducts: orderedSelection }).catch(() => {});
      const telemetrySelections: SignupProductSelection[] = isExploring
        ? [EXPLORING_SELECTION]
        : orderedSelection;
      telemetrySelections.forEach((selection) => {
        submitSignupOnboarding({ selectedProduct: selection }).catch(() => {});
        if (isInfisicalCloud()) {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: "signup_product_selected", product: selection });
        }
      });

      // The ref keeps every project created across attempts so retries stay idempotent, but a
      // product deselected after a failed attempt must not reach the invite/completion steps.
      const selectedProjects: Partial<Record<SignupProductType, Project>> = {};
      orderedSelection.forEach((type) => {
        const project = projects[type];
        if (project) selectedProjects[type] = project;
      });

      onComplete(orderedSelection, selectedProjects);
    } catch {
      createNotification({
        type: "error",
        text: failedProduct
          ? `Could not set up ${failedProduct}. Please try again.`
          : "Could not finish setting up your organization. Please try again."
      });
      setIsSettingUp(false);
    }
  };

  const continueLabel = isExploring
    ? "I'm Just Exploring, Show Me Everything"
    : `Continue with ${orderedSelection.length} product${orderedSelection.length > 1 ? "s" : ""}`;

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-label bg-clip-text font-alliance text-2xl font-normal text-transparent">
            What brings you to Infisical?
          </CardTitle>
          <CardDescription className="text-sm text-label">
            Pick everything you&apos;re interested in and we&apos;ll set your organization up around
            it. You can set up the rest anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div role="group" aria-label="Product selection" className="flex flex-col gap-3">
            {SIGNUP_PRODUCTS.map((product) => {
              const isSelected = selectedTypes.includes(product.type);
              const Icon = product.icon;

              return (
                <button
                  key={product.type}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggleProduct(product.type)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3.5 rounded-md border bg-container/50 p-4 text-left transition-colors duration-200",
                    isSelected
                      ? product.selectedCardClassName
                      : "border-border hover:bg-container-hover/50"
                  )}
                >
                  <div className={cn("shrink-0 rounded-sm border p-2", product.tileClassName)}>
                    <Icon className={cn("h-4.5 w-4.5", product.iconClassName)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{product.name}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted">{product.description}</p>
                  </div>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors duration-200",
                      isSelected
                        ? cn(product.radioClassName, product.dotClassName)
                        : "border-muted/60"
                    )}
                  >
                    {isSelected && <Check className="size-3.5 text-background" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Button
            variant="project"
            size="lg"
            isFullWidth
            isPending={isSettingUp}
            onClick={handleContinue}
          >
            {continueLabel}
          </Button>
        </CardContent>
      </AuthPagePanel>
    </div>
  );
}

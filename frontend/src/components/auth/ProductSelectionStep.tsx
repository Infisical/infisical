import { useRef, useState } from "react";
import { Check } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { EXAMPLE_PROJECT_NAME } from "@app/const";
import { isInfisicalCloud } from "@app/helpers/platform";
import { initProjectHelper } from "@app/helpers/project";
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
  if (existingProject) return existingProject;

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
  const [selectedTypes, setSelectedTypes] = useState<SignupProductType[]>([
    ProjectType.SecretManager
  ]);
  const [isExploring, setIsExploring] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  // Survives failed attempts so a retry only sets up the products still missing.
  const createdProjectsRef = useRef<Partial<Record<SignupProductType, Project>>>({});

  const toggleProduct = (product: SignupProductType) => {
    setIsExploring(false);
    setSelectedTypes((current) =>
      current.includes(product) ? current.filter((type) => type !== product) : [...current, product]
    );
  };

  const selectExploring = () => {
    setIsExploring(true);
    setSelectedTypes([]);
  };

  // Keep the platform's canonical product order regardless of click order.
  const orderedSelection = SIGNUP_PRODUCTS.filter((product) =>
    selectedTypes.includes(product.type)
  ).map((product) => product.type);
  const canContinue = isExploring || orderedSelection.length > 0;

  const handleContinue = async () => {
    if (!canContinue || isSettingUp) return;

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

      onComplete(orderedSelection, { ...projects });
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

  const continueLabel =
    !isExploring && orderedSelection.length > 0
      ? `Continue with ${orderedSelection.length} product${orderedSelection.length > 1 ? "s" : ""}`
      : "Continue";

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
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
                    {isSelected && <Check className="size-3.5 text-bunker-800" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              role="checkbox"
              aria-checked={isExploring}
              onClick={selectExploring}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3.5 rounded-md border border-dashed px-4 py-3.5 text-left text-sm transition-colors duration-200",
                isExploring
                  ? "border-project/50 bg-project/[0.04] text-foreground"
                  : "border-border text-label hover:bg-container-hover/50 hover:text-foreground"
              )}
            >
              <span className="min-w-0 flex-1">I&apos;m just exploring, show me everything</span>
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                  isExploring ? "border-project" : "border-muted/60"
                )}
              >
                {isExploring && <span className="size-2.5 rounded-full bg-project" />}
              </span>
            </button>
          </div>
          <Button
            variant="project"
            size="lg"
            isFullWidth
            isDisabled={!canContinue}
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

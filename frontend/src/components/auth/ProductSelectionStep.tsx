import { useRef, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Button, CardContent, CardDescription, CardHeader, CardTitle, Checkbox } from "@app/components/v3";
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

  const continueLabel = (() => {
    if (isExploring) return "Explore all products";
    if (orderedSelection.length === 1) {
      return `Continue with ${getSignupProduct(orderedSelection[0])?.name}`;
    }
    return `Continue with ${orderedSelection.length} products`;
  })();

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            What brings you to Infisical?
          </CardTitle>
          <CardDescription className="text-sm text-label">
            Choose the products you&apos;d like to start with. You can add more later.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            role="group"
            aria-label="Product selection"
            className="flex flex-col space-y-2 divide-y divide-border"
          >
            {SIGNUP_PRODUCTS.map((product) => {
              const isSelected = selectedTypes.includes(product.type);
              const Icon = product.icon;

              return (
                <label
                  key={product.type}
                  htmlFor={`signup-product-${product.type}`}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-2 pt-2 pb-4 text-left transition-[background-color,opacity] duration-200 hover:bg-container-hover/30",
                    isSelected && "bg-container-hover/30",
                    !isExploring && !isSelected && "opacity-50 hover:opacity-80 focus-within:opacity-80",
                    isSettingUp && "cursor-wait"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", product.iconClassName)} />
                  <span className="font-alliance text-sm font-normal text-foreground">{product.name}</span>
                  <Checkbox
                    variant="project"
                    id={`signup-product-${product.type}`}
                    isChecked={isSelected}
                    isDisabled={isSettingUp}
                    onCheckedChange={() => toggleProduct(product.type)}
                    aria-label={product.name}
                    aria-describedby={`signup-product-${product.type}-description`}
                  />
                  <span
                    id={`signup-product-${product.type}-description`}
                    className="col-start-2 text-sm leading-snug text-muted"
                  >
                    {product.description}
                  </span>
                </label>
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

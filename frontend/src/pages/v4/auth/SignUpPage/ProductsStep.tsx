import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Icon } from "@infisical/cipher/ui/icon";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { toast } from "@infisical/cipher/ui/sonner";

import {
  EXPLORING_SELECTION,
  getSignupProduct,
  SIGNUP_PRODUCTS,
  SignupProductSelection,
  SignupProductType
} from "@app/components/auth/signupProducts";
import { EXAMPLE_PROJECT_NAME } from "@app/const";
import { isInfisicalCloud } from "@app/helpers/platform";
import { ensureExampleSecrets, initProjectHelper } from "@app/helpers/project";
import { submitSignupOnboarding } from "@app/hooks/api/auth/queries";
import { createWorkspace, fetchUserWorkspaces } from "@app/hooks/api/projects/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

import { productOf } from "../../shell/navigation";
import { AuthPage } from "../components/AuthPage";

const AGENT_VAULT_FIRST_PROJECT_NAME = "My first project";

const setUpProduct = async (product: SignupProductType): Promise<Project | undefined> => {
  if (product === ProjectType.PAM) return undefined;

  const [existingProject] = await fetchUserWorkspaces(false, product);
  if (existingProject) {
    if (product === ProjectType.SecretManager) await ensureExampleSecrets(existingProject.id);
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
    case ProjectType.AgentVault: {
      const { data } = await createWorkspace({
        projectName: AGENT_VAULT_FIRST_PROJECT_NAME,
        type: ProjectType.AgentVault
      });
      return data.project;
    }
    default: {
      const { data } = await createWorkspace({ projectName: EXAMPLE_PROJECT_NAME, type: product });
      return data.project;
    }
  }
};

type Props = {
  initialProducts: SignupProductType[];
  projectCache: { current: Partial<Record<SignupProductType, Project>> };
  onComplete: (
    products: SignupProductType[],
    projects: Partial<Record<SignupProductType, Project>>
  ) => void;
  progress: React.ReactNode;
  isPreview?: boolean;
};

export const ProductsStep = ({
  initialProducts,
  projectCache,
  onComplete,
  progress,
  isPreview
}: Props) => {
  const [selectedTypes, setSelectedTypes] = useState<SignupProductType[]>(initialProducts);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const toggleProduct = (product: SignupProductType) =>
    setSelectedTypes((current) =>
      current.includes(product) ? current.filter((type) => type !== product) : [...current, product]
    );

  const orderedSelection = SIGNUP_PRODUCTS.filter((product) =>
    selectedTypes.includes(product.type)
  ).map((product) => product.type);
  const isExploring = orderedSelection.length === 0;

  const handleContinue = async () => {
    if (isSettingUp || isPreview) return;
    setIsSettingUp(true);
    let failedProduct: string | undefined;
    try {
      const projects = projectCache.current;
      for (const type of orderedSelection) {
        if (!(type in projects)) {
          failedProduct = getSignupProduct(type)?.name;
          // eslint-disable-next-line no-await-in-loop
          projects[type] = await setUpProduct(type);
        }
      }

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

      const selectedProjects: Partial<Record<SignupProductType, Project>> = {};
      orderedSelection.forEach((type) => {
        const project = projects[type];
        if (project) selectedProjects[type] = project;
      });

      onComplete(orderedSelection, selectedProjects);
    } catch {
      toast.error(
        failedProduct
          ? `Could not set up ${failedProduct}. Please try again.`
          : "Could not finish setting up your organization. Please try again."
      );
      setIsSettingUp(false);
    }
  };

  let continueLabel = `Continue with ${orderedSelection.length} products`;
  if (isExploring) continueLabel = "Explore all products";
  else if (orderedSelection.length === 1) {
    continueLabel = `Continue with ${getSignupProduct(orderedSelection[0])?.name}`;
  }

  return (
    <AuthPage
      pageTitle="Sign Up"
      title="What brings you to Infisical?"
      description="Pick what to set up first. You can add more later."
      progress={progress}
      variant="focused"
      wide
    >
      <List label="Products" selection="none">
        {SIGNUP_PRODUCTS.map((product) => (
          <ListRow
            key={product.type}
            value={product.type}
            label={product.name}
            title={product.name}
            description={product.description}
            media={<Icon name={productOf(product.type).icon} size={18} />}
            onClick={() => !isSettingUp && toggleProduct(product.type)}
            actions={
              <Checkbox
                aria-label={product.name}
                checked={selectedTypes.includes(product.type)}
                disabled={isSettingUp}
                onCheckedChange={() => toggleProduct(product.type)}
              />
            }
          />
        ))}
      </List>
      <Button
        type="button"
        variant="accent"
        size="lg"
        className="w-full"
        loading={isSettingUp}
        onClick={handleContinue}
      >
        {continueLabel}
      </Button>
    </AuthPage>
  );
};

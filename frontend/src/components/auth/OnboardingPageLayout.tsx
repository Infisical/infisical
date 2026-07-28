import { ComponentProps, ReactNode } from "react";

import { Badge } from "@app/components/v3";

import { AuthPageLayout } from "./AuthPageLayout";

type Props = Omit<ComponentProps<typeof AuthPageLayout>, "children" | "headerAction"> & {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
};

export const OnboardingPageLayout = ({ children, currentStep, totalSteps, ...props }: Props) => (
  <AuthPageLayout
    {...props}
    headerAction={
      <Badge
        variant="outline"
        className="h-7 border-0 bg-foreground/5 px-2.5 font-jetbrains-mono text-xs tracking-widest uppercase"
      >
        Step {currentStep} of {totalSteps}
      </Badge>
    }
  >
    {children}
  </AuthPageLayout>
);

import { Children, cloneElement, ReactElement, ReactNode } from "react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

export type StepperProps = {
  activeStep: number;
  children: ReactNode;
  direction: "vertical" | "horizontal";
  className?: string;
};

export const Stepper = ({ activeStep, children, direction, className }: StepperProps) => {
  return (
    <div
      className={twMerge(
        "flex w-full items-center space-x-3 rounded-md border border-border/30 p-2",
        className
      )}
    >
      {Children.map(children as ReactNode, (child: ReactNode, index) => {
        const isCompleted = activeStep > index;
        const isActive = index === activeStep;
        const isNotLast = index + 1 !== (children as Array<ReactNode>).length;
        return (
          <div className={twMerge("flex shrink-0 items-center space-x-3", isNotLast && "grow")}>
            <div className="flex shrink-0 items-center space-x-2">
              <div
                className={twMerge(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium text-muted transition-all",
                  isCompleted ? "bg-project" : "border border-project/30 text-label",
                  isActive && "bg-project text-muted"
                )}
              >
                {isCompleted ? <FontAwesomeIcon icon={faCheck} /> : index + 1}
              </div>
              {cloneElement(child as ReactElement, {
                direction,
                activeStep,
                isCompleted,
                isActive
              })}
            </div>
            {isNotLast && (
              <div
                style={{ height: "1px" }}
                className={twMerge("grow bg-label/30", isCompleted && "bg-project")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export type StepProps = {
  title: string;
  description?: ReactNode;
  // isActive?: boolean;
  // isCompleted?: boolean;
  // activeStep?: number;
  // direction?: "vertical" | "horizontal";
};

export const Step = ({ title, description }: StepProps) => {
  return (
    <div className="flex flex-col text-label">
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="text-xs">{description}</div>}
    </div>
  );
};

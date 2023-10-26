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
        "flex items-center w-full space-x-3 p-2 border border-bunker-300/30 rounded-md",
        className
      )}
    >
      {Children.map(children as ReactNode, (child: ReactNode, index) => {
        const isCompleted = activeStep > index;
        const isActive = index === activeStep;
        const isNotLast = index + 1 !== (children as Array<ReactNode>).length;
        return (
          <div
            className={twMerge(
              "flex items-center space-x-3 flex-shrink-0",
              isNotLast && "flex-grow"
            )}
          >
            <div className="flex items-center space-x-2 flex-shrink-0">
              <div
                className={twMerge(
                  "w-7 h-7 flex items-center justify-center font-medium text-mineshaft-800 text-sm rounded-full transition-all",
                  isCompleted ? "bg-primary" : "border text-bunker-300 border-primary/30",
                  isActive && "bg-primary text-mineshaft-800"
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
                className={twMerge("flex-grow bg-bunker-300/30", isCompleted && "bg-primary")}
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
    <div className="flex flex-col text-gray-300">
      <div className="font-medium text-sm">{title}</div>
      {description && <div className="text-xs">{description}</div>}
    </div>
  );
};

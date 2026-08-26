import { twMerge } from "tailwind-merge";

interface IProps {
  className?: string;
  orientation?: "horizontal" | "vertical";
}

export const Divider = ({ className, orientation = "horizontal" }: IProps): JSX.Element => {
  if (orientation === "horizontal") {
    return (
      <div className={twMerge("flex items-center px-2 opacity-50", className)}>
        <div aria-hidden="true" className="h-1 w-full grow border-t border-mineshaft-300" />
      </div>
    );
  }
  return (
    <div className={twMerge("flex items-center opacity-50", className)}>
      <div aria-hidden="true" className="h-full w-px grow rounded-md bg-mineshaft-300" />
    </div>
  );
};

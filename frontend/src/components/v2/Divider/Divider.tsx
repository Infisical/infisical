import { twMerge } from "tailwind-merge";

interface IProps {
  className?: string;
}

export const Divider = ({ className }: IProps): JSX.Element => {
  return (
    <div className={twMerge("flex items-center px-2 opacity-50", className)}>
      <div aria-hidden="true" className="h-5 w-full grow border border-t border-mineshaft-200" />
    </div>
  );
};

import { twMerge } from "tailwind-merge";

export type Props = {
  className?: string;
};

// To show something is coming up
// Can be used with cards
// Tables etc
export const Skeleton = ({ className }: Props) => (
  <div className={twMerge("h-6 w-full animate-pulse rounded-md bg-mineshaft-800", className)} />
);

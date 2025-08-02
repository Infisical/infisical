import { Button } from "@react-email/components";

type Props = {
  href: string;
  children: string;
};

export const BaseButton = ({ href, children }: Props) => {
  return (
    <Button
      href={href}
      className="rounded-[8px] py-[12px] px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
    >
      {children}
    </Button>
  );
};

import { ChevronDown, Folder } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@app/components/v3";
import { TAccessiblePamAccount } from "@app/hooks/api/pam";

import { AccountRow } from "./AccountRow";

type Props = {
  folderName: string;
  accounts: TAccessiblePamAccount[];
  onLaunch: (account: TAccessiblePamAccount) => void;
};

export const FolderSection = ({ folderName, accounts, onLaunch }: Props) => {
  return (
    <Accordion type="single" collapsible defaultValue={folderName}>
      <AccordionItem value={folderName}>
        <AccordionTrigger className="[&>[data-slot=accordion-chevron]]:hidden">
          <div className="flex flex-1 items-center gap-2">
            <Folder className="size-4 text-product-pam" />
            <span className="text-sm font-medium">{folderName}</span>
            <span className="text-xs text-muted">({accounts.length})</span>
          </div>
          <ChevronDown className="size-4 shrink-0 rotate-90 text-label transition-transform duration-200 [[data-state=open]>&]:rotate-0" />
        </AccordionTrigger>
        <AccordionContent className="!p-0">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} onLaunch={onLaunch} />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

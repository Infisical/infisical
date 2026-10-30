import { ChevronLeftIcon } from "lucide-react";

import { Button } from "@app/components/v3";

export const CommitSheetBackLink = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button variant="ghost" size="xs" className="-ml-2 w-fit text-muted" onClick={onClick}>
    <ChevronLeftIcon />
    {label}
  </Button>
);

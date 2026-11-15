import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  getSkillEntryName,
  SKILL_ENTRY_FILE,
  TSkillFileChange
} from "@app/helpers/agentVaultSkills";

import { SkillFileDiff } from "./SkillFileDiff";

const STATUS_BADGE = {
  added: { label: "Added", variant: "success" },
  modified: { label: "Modified", variant: "warning" },
  deleted: { label: "Deleted", variant: "danger" }
} as const;

const ChangeBody = ({ change }: { change: TSkillFileChange }) => {
  const isContentChanged = change.oldText !== change.newText;
  const isModeChanged =
    change.status === "modified" && change.oldMode !== undefined && change.newMode !== undefined;
  return (
    <div className="flex flex-col border-t border-border">
      {isModeChanged && (
        <p className="px-3 py-2 font-mono text-xs text-label">
          {change.oldMode} → {change.newMode}
        </p>
      )}
      {change.isBinary && (
        <p className="px-3 py-2 text-xs text-muted">Binary file. Its contents are not shown.</p>
      )}
      {!change.isBinary && isContentChanged && change.isTooLarge && (
        <p className="px-3 py-2 text-xs text-muted">Too large to show a diff</p>
      )}
      {!change.isBinary && isContentChanged && !change.isTooLarge && (
        <SkillFileDiff oldText={change.oldText ?? ""} newText={change.newText ?? ""} />
      )}
    </div>
  );
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  skillName: string;
  nextVersion: number;
  /** The latest version, when it is newer than the one editing started from. */
  newerVersion?: number | null;
  changes: TSkillFileChange[];
  isPending: boolean;
  onSave: () => void;
};

export const SaveSkillVersionSheet = ({
  isOpen,
  onOpenChange,
  skillName,
  nextVersion,
  newerVersion,
  changes,
  isPending,
  onSave
}: Props) => {
  const entryChange = changes.find((change) => change.path === SKILL_ENTRY_FILE);
  const newName = getSkillEntryName(entryChange?.newText);
  const renamedTo = newName && newName !== skillName ? newName : null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        size="wide"
        className="flex h-full max-h-full w-full flex-col gap-y-0"
        isPending={isPending}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>
            Save v{nextVersion} of {skillName}
          </SheetTitle>
          <SheetDescription>
            Review the changes. Agents get the new version the next time they start.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          {renamedTo && (
            <Alert variant="info">
              <AlertDescription>
                This will rename the skill from {skillName} to {renamedTo}.
              </AlertDescription>
            </Alert>
          )}

          {newerVersion && (
            <Alert variant="warning">
              <AlertDescription>
                A newer version (v{newerVersion}) was published while you were editing. Saving will
                make your version the latest.
              </AlertDescription>
            </Alert>
          )}

          <Accordion type="multiple" defaultValue={changes.map((change) => change.path)}>
            {changes.map((change) => (
              <AccordionItem key={change.path} value={change.path}>
                <AccordionTrigger className="min-h-10 px-3">
                  <span className="min-w-0 flex-1 truncate text-left text-sm" title={change.path}>
                    {change.path}
                  </span>
                  {!(change.status === "modified" && change.isTooLarge) && (
                    <span className="shrink-0 text-xs tabular-nums">
                      <span className="text-success">+{change.additions}</span>{" "}
                      <span className="text-danger">-{change.deletions}</span>
                    </span>
                  )}
                  <Badge variant={STATUS_BADGE[change.status].variant}>
                    {STATUS_BADGE[change.status].label}
                  </Badge>
                </AccordionTrigger>
                <AccordionContent>
                  <ChangeBody change={change} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <SheetFooter className="justify-end border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} isDisabled={isPending}>
            Back to Editing
          </Button>
          <Button variant="av" isPending={isPending} onClick={onSave}>
            {newerVersion ? "Save Anyway" : "Save Version"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

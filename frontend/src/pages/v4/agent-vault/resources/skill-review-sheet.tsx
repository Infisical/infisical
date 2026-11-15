import { useMemo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Meta } from "@infisical/cipher/ui/text";

import {
  buildDiffRows,
  getSkillEntryName,
  SKILL_ENTRY_FILE,
  type TDiffRow,
  type TSkillFileChange
} from "@app/helpers/agentVaultSkills";

import styles from "./skills.module.css";

const STATUS: Record<TSkillFileChange["status"], { label: string; tone: BadgeTone }> = {
  added: { label: "Added", tone: "ok" },
  modified: { label: "Modified", tone: "warn" },
  deleted: { label: "Deleted", tone: "bad" }
};

const DIFF_MARK = { added: "+", removed: "-", context: " " } as const;

const keyDiffRows = (rows: TDiffRow[]) => {
  let oldLine = 0;
  let newLine = 0;
  return rows.map((row) => {
    if (row.type === "skip") {
      oldLine += row.count;
      newLine += row.count;
      return { row, key: `skip:${oldLine}:${newLine}` };
    }
    if (row.oldLine === null && row.newLine === null)
      return { row, key: `end:${oldLine}:${newLine}` };
    oldLine = row.oldLine ?? oldLine;
    newLine = row.newLine ?? newLine;
    return { row, key: `${row.type}:${oldLine}:${newLine}` };
  });
};

export const SkillFileDiff = ({ oldText, newText }: { oldText: string; newText: string }) => {
  const rows = useMemo(() => keyDiffRows(buildDiffRows(oldText, newText)), [oldText, newText]);
  if (!rows.length) return <Meta>The file is empty.</Meta>;
  return (
    <div className={styles.diff}>
      <table className={styles.diffTable}>
        <tbody>
          {rows.map(({ row, key }) =>
            row.type === "skip" ? (
              <tr key={key} className={styles.diffSkip}>
                <td colSpan={4}>
                  {row.count === 1 ? "1 unchanged line" : `${row.count} unchanged lines`}
                </td>
              </tr>
            ) : (
              <tr
                key={key}
                className={styles.diffRow}
                data-change={row.type === "context" ? undefined : row.type}
              >
                <td className={styles.lineNumber}>{row.oldLine ?? ""}</td>
                <td className={styles.lineNumber}>{row.newLine ?? ""}</td>
                <td className={styles.lineMark}>{DIFF_MARK[row.type]}</td>
                <td className={styles.lineText}>{row.text}</td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};

const ChangeBody = ({ change }: { change: TSkillFileChange }) => {
  const isContentChanged = change.oldText !== change.newText;
  const isModeChanged =
    change.status === "modified" && change.oldMode !== undefined && change.newMode !== undefined;
  return (
    <>
      {isModeChanged && <Meta>{`Mode ${change.oldMode} to ${change.newMode}`}</Meta>}
      {change.isBinary && <Meta>Binary file. Its contents are not shown.</Meta>}
      {!change.isBinary && isContentChanged && change.isTooLarge && (
        <Meta>Too large to show a diff</Meta>
      )}
      {!change.isBinary && isContentChanged && !change.isTooLarge && (
        <SkillFileDiff oldText={change.oldText ?? ""} newText={change.newText ?? ""} />
      )}
    </>
  );
};

export const SaveSkillVersionSheet = ({
  open,
  onOpenChange,
  skillName,
  nextVersion,
  newerVersion,
  changes,
  pending,
  onSave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string;
  nextVersion: number;
  newerVersion?: number | null;
  changes: TSkillFileChange[];
  pending: boolean;
  onSave: () => void;
}) => {
  const newName = getSkillEntryName(
    changes.find((change) => change.path === SKILL_ENTRY_FILE)?.newText
  );
  const renamedTo = newName && newName !== skillName ? newName : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" pending={pending}>
        <SheetHeader>
          <SheetTitle>{`Save v${nextVersion} of ${skillName}`}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {renamedTo && (
            <Alert tone="info">{`This renames the skill from ${skillName} to ${renamedTo}.`}</Alert>
          )}
          {newerVersion && (
            <Alert tone="warn">
              {`v${newerVersion} was published while you were editing. Saving makes your version the latest.`}
            </Alert>
          )}
          <Accordion type="multiple" defaultValue={changes.map((change) => change.path)}>
            {changes.map((change) => (
              <AccordionItem key={change.path} value={change.path}>
                <AccordionTrigger>
                  <span className={styles.changeHead}>
                    <span className={styles.changePath} title={change.path}>
                      {change.path}
                    </span>
                    {!(change.status === "modified" && change.isTooLarge) && (
                      <span className={styles.counts}>
                        <span className={styles.additions}>+{change.additions}</span>{" "}
                        <span className={styles.deletions}>-{change.deletions}</span>
                      </span>
                    )}
                    <Badge tone={STATUS[change.status].tone}>{STATUS[change.status].label}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ChangeBody change={change} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Back to editing
          </Button>
          <Button variant="primary" loading={pending} onClick={onSave}>
            {newerVersion ? "Save anyway" : "Save version"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

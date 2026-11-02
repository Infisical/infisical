import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";

export type SecretConflict = {
  id: string;
  name: string;
  location: string;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  conflicts: SecretConflict[];
  description: string;
  onResolve: (resolution: "overwrite" | "skip") => void;
};

export const SecretConflictsDialog = ({
  isOpen,
  onOpenChange,
  conflicts,
  description,
  onResolve
}: Props) => (
  <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Resolve Secret Conflicts</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <ul className="max-h-64 overflow-y-auto rounded-md border border-border bg-container">
        {conflicts.map(({ id, name, location }) => (
          <li
            key={id}
            className="flex min-w-0 flex-col gap-1 border-b border-border px-3 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="font-mono text-sm break-all text-foreground">{name}</span>
            <span className="font-mono text-xs break-all text-muted">{location}</span>
          </li>
        ))}
      </ul>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="outline" onClick={() => onResolve("skip")}>
          Skip conflicts
        </AlertDialogAction>
        <AlertDialogAction variant="danger" onClick={() => onResolve("overwrite")}>
          Overwrite conflicts
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

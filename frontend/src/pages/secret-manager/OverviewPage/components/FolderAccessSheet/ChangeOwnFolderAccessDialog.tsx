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

export type TOwnFolderAccessChange = {
  summary: string;
  apply: () => void;
};

type Props = {
  change: TOwnFolderAccessChange | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (change: TOwnFolderAccessChange) => void;
  folderPath: string;
  environmentName: string;
};

export const ChangeOwnFolderAccessDialog = ({
  change,
  onOpenChange,
  onConfirm,
  folderPath,
  environmentName
}: Props) => (
  <AlertDialog open={Boolean(change)} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Change Your Own Access?</AlertDialogTitle>
        <AlertDialogDescription>
          You are changing your own access to{" "}
          <span className="font-mono text-foreground">{folderPath}</span> on{" "}
          <span className="font-medium text-foreground">{environmentName}</span>. {change?.summary}
        </AlertDialogDescription>
        <AlertDialogDescription>
          Only Full Access can grant or revoke access to this folder, so this change can stop you
          from managing access here. If it does, a project admin or someone else with Full Access
          would have to restore it.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="warning"
          onClick={() => {
            if (change) onConfirm(change);
          }}
        >
          Change My Access
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

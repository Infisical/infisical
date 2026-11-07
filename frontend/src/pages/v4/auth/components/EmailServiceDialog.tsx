import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export const EmailServiceDialog = ({ open, onOpenChange }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Email service not configured</DialogTitle>
        <DialogDescription>
          An instance administrator must configure an email service provider before this action can
          run.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button asChild variant="link">
          <a
            href="https://infisical.com/docs/self-hosting/configuration/envars#email-service"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </Button>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export const EmailServiceDialog = ({ open, onOpenChange }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle
          badges={
            <DocumentationLink
              href="https://infisical.com/docs/self-hosting/configuration/envars#email-service"
              subject="email service configuration"
            />
          }
        >
          Email service not configured
        </DialogTitle>
        <DialogDescription>
          An instance administrator must configure an email service provider before this action can
          run.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

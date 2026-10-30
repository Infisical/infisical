import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge
} from "@app/components/v3";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

export const EmailServiceSetupModal = ({ isOpen, onOpenChange }: Props) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Email Service Not Configured
          <DocumentationLinkBadge
            variant="minified"
            href="https://infisical.com/docs/self-hosting/configuration/envars#email-service"
          />
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

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { useAssignCertificateToApplication } from "@app/hooks/api/certificates";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { useDebounce } from "@app/hooks/useDebounce";

import {
  CertificateProfileSelect,
  CertificateReferenceField,
  useCertificateImportProfiles,
  useCertificateImportReference
} from "./certificate-import-fields";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  certificateId: string;
  hasProfile: boolean;
};

export const AssignCertificateToApplicationModal = ({
  isOpen,
  onClose,
  certificateId,
  hasProfile
}: Props) => {
  const [selectedApplication, setSelectedApplication] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isPending } = useListPkiApplications(
    { search: debouncedSearch || undefined, limit: 20 },
    {
      enabled: isOpen
    }
  );
  const applications = data?.applications ?? [];
  const assign = useAssignCertificateToApplication();

  const [profileId, setProfileId] = useState<string>();
  const [providerReference, setProviderReference] = useState("");
  const [referenceError, setReferenceError] = useState<string>();
  const canChooseProfile = !hasProfile && Boolean(selectedApplication);
  const { profileOptions, isProfilesLoading } = useCertificateImportProfiles(
    canChooseProfile ? selectedApplication?.id : undefined
  );
  const selectedProfile = profileOptions.find((option) => option.id === profileId) ?? null;
  const referenceSource = useCertificateImportReference(selectedProfile);
  const { reference } = referenceSource;

  const resetProfile = () => {
    setProfileId(undefined);
    setProviderReference("");
    setReferenceError(undefined);
  };

  useEffect(() => {
    if (!isOpen) {
      setSelectedApplication(null);
      setSearch("");
      resetProfile();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!selectedApplication) return;
    const chosenProfileId = canChooseProfile ? profileId : undefined;
    const externalMetadata =
      chosenProfileId && reference ? reference.parse(providerReference.trim()) : undefined;
    if (chosenProfileId && reference && !externalMetadata) {
      setReferenceError(reference.invalidMessage);
      return;
    }
    try {
      await assign.mutateAsync({
        certificateId,
        applicationId: selectedApplication.id,
        ...(chosenProfileId ? { profileId: chosenProfileId } : {}),
        ...(externalMetadata ? { externalMetadata } : {})
      });
      createNotification({ type: "success", text: "Certificate assigned to Application" });
      onClose();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to assign certificate.";
      createNotification({ type: "error", text: detail });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Certificate to Application</DialogTitle>
          <DialogDescription>
            This is a one-way operation, once assigned, the certificate cannot be moved to a
            different Application.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Application</FieldLabel>
          <FieldContent>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  // oxlint-disable-next-line jsx-a11y/role-has-required-aria-props -- PopoverTrigger sets aria-controls and aria-expanded
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className={selectedApplication ? "" : "text-muted"}>
                    {selectedApplication ? selectedApplication.name : "Select an application"}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    aria-label="Search applications"
                    placeholder="Search applications..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {isPending ? "Loading applications..." : "No applications found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {applications.map((app) => (
                        <CommandItem
                          key={app.id}
                          value={app.id}
                          onSelect={() => {
                            if (selectedApplication?.id !== app.id) resetProfile();
                            setSelectedApplication({ id: app.id, name: app.name });
                            setPopoverOpen(false);
                          }}
                          className="gap-2"
                        >
                          <Check
                            className={
                              selectedApplication?.id === app.id ? "opacity-100" : "opacity-0"
                            }
                          />
                          <span className="truncate">{app.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </FieldContent>
        </Field>

        {canChooseProfile && (
          <Field>
            <FieldLabel>Certificate Profile (optional)</FieldLabel>
            <FieldContent>
              <CertificateProfileSelect
                applicationId={selectedApplication?.id}
                options={profileOptions}
                isLoading={isProfilesLoading}
                value={profileId}
                onChange={(id) => {
                  setProfileId(id);
                  setProviderReference("");
                  setReferenceError(undefined);
                }}
              />
              <FieldDescription>
                Lets the profile renew, reissue and revoke this certificate. It can&apos;t be
                changed once set. Leave empty to only track the certificate.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}

        {canChooseProfile && reference && (
          <Field data-invalid={Boolean(referenceError)}>
            <FieldLabel>{reference.label}</FieldLabel>
            <FieldContent>
              <CertificateReferenceField
                source={referenceSource}
                value={providerReference}
                onChange={(value) => {
                  setProviderReference(value);
                  setReferenceError(undefined);
                }}
              />
              <FieldDescription>{reference.description}</FieldDescription>
              {referenceError && <FieldError>{referenceError}</FieldError>}
            </FieldContent>
          </Field>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="project"
            isPending={assign.isPending}
            isDisabled={!selectedApplication || assign.isPending}
            onClick={handleSubmit}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

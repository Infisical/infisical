import { FormLabel, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: TCertificateProfileWithDetails;
};

export const RevealAcmeEabSecretModal = ({ isOpen, onClose, profile }: Props) => {
  const [isAcmeDirectoryUrlCopied, setIsAcmeDirectoryUrlCopied] = useToggle(false);
  const [isEabKidCopied, setIsEabKidCopied] = useToggle(false);
  const [isEabSecretCopied, setIsEabSecretCopied] = useToggle(false);

  const acmeDirectoryUrl = "http://FIXME.com/directory";
  const eabKid = profile.id;
  const eabSecret = "FIXME";
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent
        title="Reveal EAB Secret"
        subTitle="To issue certificates automatically, your ACME client needs the following details."
      >
        <FormLabel
          label="ACME Directory URL"
          tooltipText="The ACME directory URL for your ACME client to to issue certificates."
        />
        <Input value={acmeDirectoryUrl} disabled />
        <div className="flex gap-2">
          <IconButton
            ariaLabel="copy"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(acmeDirectoryUrl);
              setIsAcmeDirectoryUrlCopied.on();
            }}
            className="w-10"
          >
            <FontAwesomeIcon icon={isAcmeDirectoryUrlCopied ? faCheck : faCopy} />
          </IconButton>
        </div>

        <FormLabel
          label="EAB KID"
          tooltipText="The EAB Key Identifier (KID) for your ACME client to authenticate when registering a new account."
        />
        <div className="flex gap-2">
          <Input value={eabKid} disabled />
          <IconButton
            ariaLabel="copy"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(eabKid);
              setIsEabKidCopied.on();
            }}
            className="w-10"
          >
            <FontAwesomeIcon icon={isEabKidCopied ? faCheck : faCopy} />
          </IconButton>
        </div>

        <FormLabel
          label="EAB Secret"
          className="mt-4"
          tooltipText="The EAB Secret for your ACME client to authenticate when registering a new account."
        />
        <div className="flex gap-2">
          <Input value={eabSecret} isDisabled />
          <IconButton
            ariaLabel="copy"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(eabSecret);
              setIsEabSecretCopied.on();
            }}
            className="w-10"
          >
            <FontAwesomeIcon icon={isEabSecretCopied ? faCheck : faCopy} />
          </IconButton>
        </div>
      </ModalContent>
    </Modal>
  );
};

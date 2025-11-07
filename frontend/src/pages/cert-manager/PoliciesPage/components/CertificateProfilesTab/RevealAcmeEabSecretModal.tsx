import {
  Alert,
  AlertDescription,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Spinner
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles";
import { useRevealAcmeEabSecret } from "@app/hooks/api/certificateProfiles/queries";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const RESET_COPIED_DELAY = 1 * 1000;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: TCertificateProfileWithDetails;
};

export const RevealAcmeEabSecretModal = ({ isOpen, onClose, profile }: Props) => {
  const [isAcmeDirectoryUrlCopied, setIsAcmeDirectoryUrlCopied] = useToggle(false);
  const [isEabKidCopied, setIsEabKidCopied] = useToggle(false);
  const [isEabSecretCopied, setIsEabSecretCopied] = useToggle(false);
  const revealAcmeEabSecret = useRevealAcmeEabSecret({ profileId: profile.id });
  const { data, isLoading, isError, error } = revealAcmeEabSecret;
  const { directoryUrl } = profile.acmeConfig!;
  const { eabKid, eabSecret } = data ?? { eabKid: "", eabSecret: "" };

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
        title="Reveal ACME EAB"
        subTitle="To issue certificates automatically, your ACME client needs the following details."
      >
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Spinner size="sm" />
          </div>
        )}
        {isError && (
          <Alert variant="danger">
            <AlertDescription>Failed to reveal EAB secret: {error.message}</AlertDescription>
          </Alert>
        )}
        {data && (
          <>
            <FormLabel
              label="ACME Directory URL"
              tooltipText="The ACME directory URL for your ACME client to issue certificates."
            />
            <div className="flex gap-2">
              <Input value={directoryUrl} disabled />
              <IconButton
                ariaLabel="copy"
                variant="outline_bg"
                colorSchema="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(directoryUrl);
                  setIsAcmeDirectoryUrlCopied.on();
                  setTimeout(() => {
                    setIsAcmeDirectoryUrlCopied.off();
                  }, RESET_COPIED_DELAY);
                }}
                className="w-10"
              >
                <FontAwesomeIcon icon={isAcmeDirectoryUrlCopied ? faCheck : faCopy} />
              </IconButton>
            </div>

            <FormLabel
              label="EAB KID"
              className="mt-4"
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
                  setTimeout(() => {
                    setIsEabKidCopied.off();
                  }, RESET_COPIED_DELAY);
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
                  setTimeout(() => {
                    setIsEabSecretCopied.off();
                  }, RESET_COPIED_DELAY);
                }}
                className="w-10"
              >
                <FontAwesomeIcon icon={isEabSecretCopied ? faCheck : faCopy} />
              </IconButton>
            </div>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

import { IconButton } from "@app/components/v2";
import * as Popover from "@radix-ui/react-popover";
import { AiFillEye } from "react-icons/ai";
import { ConsumerSecret, CreditCardData, PrivateNoteData, WebLoginData } from "../ConsumerSecretPage.types";

type ViewConsumerSecretProps = {
    secret: ConsumerSecret
}

const ViewConsumerSecret = ({ secret }: ViewConsumerSecretProps) => {
    const renderSecretDetails = () => {
        switch (secret.type) {
          case "web_login":
            const webLoginData = secret.data as WebLoginData;
            return (
              <>
                <p><strong>Name:</strong> {secret.name}</p>
                <p><strong>URL:</strong> {webLoginData.url}</p>
                <p><strong>Username:</strong> {webLoginData.username}</p>
                <p><strong>Password:</strong> {webLoginData.password}</p>
              </>
            );
          case "credit_card":
            const creditCardData = secret.data as CreditCardData;
            return (
              <>
                <p><strong>Name:</strong> {secret.name}</p>
                <p><strong>Name on Card:</strong> {creditCardData.nameOnCard}</p>
                <p><strong>Card Number:</strong> {creditCardData.cardNumber}</p>
                <p><strong>Valid Through:</strong> {creditCardData.validThrough}</p>
                <p><strong>CVV:</strong> {creditCardData.cvv}</p>
              </>
            );
          case "private_note":
            const privateNoteData = secret.data as PrivateNoteData;
            return (
              <>
                <p><strong>Name:</strong> {secret.name}</p>
                <p><strong>Title:</strong> {privateNoteData.title}</p>
                <p><strong>Content:</strong> {privateNoteData.content}</p>
              </>
            );
          default:
            return <p>Unknown secret type</p>;
        }
      };

  return (
    <Popover.Root>
      <Popover.Trigger>
        <IconButton
          variant="plain"
          ariaLabel="view"
          className="hover:bg-gray-200 p-2 rounded"
        >
          <AiFillEye className="text-xl" />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content className="p-4 bg-gray-800 border border-gray-600 text-white rounded shadow-lg z-50">
        {renderSecretDetails()}
      </Popover.Content>
    </Popover.Root>
  );
};

export default ViewConsumerSecret;

import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { usePopUp } from "@app/hooks";

import { AddConsumerSecretModal } from "./components/AddConsumerSecretModal";

export const ConsumerSecretsView = () => {
    const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
        "createConsumerSecret"
      ] as const);
      
        return (
            <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Your Consumer Secrets</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            handlePopUpOpen("createConsumerSecret");
          }}
        >
          Add User Secret
        </Button>
      </div>

      <AddConsumerSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
        )
    
    };
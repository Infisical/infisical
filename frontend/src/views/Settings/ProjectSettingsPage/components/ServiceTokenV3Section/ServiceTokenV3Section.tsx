import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AddServiceTokenV3Modal } from "./AddServiceTokenV3Modal";
import { ServiceTokenV3Table } from "./ServiceTokenV3Table";
import { Button } from "@app/components/v2";
import { usePopUp } from "@app/hooks/usePopUp";

export const ServiceTokenV3Section = () => {
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "createServiceTokenV3"
    ] as const);
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="flex justify-between mb-8">
            <p className="text-xl font-semibold text-mineshaft-100">
              Service Tokens 2.0
            </p>
            <Button
                colorSchema="secondary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("createServiceTokenV3")}
            >
              Create ST V3
            </Button>
          </div>
          <ServiceTokenV3Table />
          <AddServiceTokenV3Modal 
            popUp={popUp}
            handlePopUpToggle={handlePopUpToggle}
          />
        </div>
    );
}
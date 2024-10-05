import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, DeleteActionModal } from "@app/components/v2";

import { FormModal } from "../Form/FormModal";
import UserSecretForm from "../Form/UserForm";
import SecretsTable from "../SecretsTable";
import { useCreditCardTab } from "./CreditCardTab.controller";

const CreditCardTab = () => {
  const {
    onCreateFormModalProps,
    onCreateFormProps,
    secretsTableProps,
    deleteActionModalProps,
    getEditFormModalProps,
    getEditFormProps,
    onClickCreateSecret
  } = useCreditCardTab();

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Credit Card</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={onClickCreateSecret}
        >
          Create Secret
        </Button>
      </div>
      <SecretsTable {...secretsTableProps} />
      <FormModal {...onCreateFormModalProps}>
        <UserSecretForm {...onCreateFormProps} />
      </FormModal>
      <FormModal {...getEditFormModalProps}>
        <UserSecretForm {...getEditFormProps()} />
      </FormModal>
      <DeleteActionModal {...deleteActionModalProps} />
    </div>
  );
};

export default CreditCardTab;

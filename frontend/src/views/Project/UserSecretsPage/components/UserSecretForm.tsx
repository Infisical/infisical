import React, { useState } from "react";

import { Button } from "@app/components/v2";
import { UserSecretType } from "@app/hooks/api/userSecrets/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { LoginSecretForm } from "./forms/LoginSecretForm";

type Props = {
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createUserSecret"]>,
    state?: boolean
  ) => void;
};

export const UserSecretForm: React.FC<Props> = ({ handlePopUpToggle }) => {
  const [step, setStep] = useState(1);
  const [secretType, setSecretType] = useState<UserSecretType | null>(null);

  const handleTypeSelection = (type: UserSecretType) => {
    setSecretType(type);
    setStep(2);
  };

  const renderForm = (type: UserSecretType) => {
    switch (type) {
      case UserSecretType.Login:
        return <LoginSecretForm onSubmit={() => handlePopUpToggle("createUserSecret", false)} />;
      default:
        return null;
    }
  };

  if (step === 1) {
    return (
      <div>
        <h2 className="mb-4">Select User Secret Type</h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.values(UserSecretType).map((type) => (
            <Button
              key={type}
              className="justify-between"
              variant="outline_bg"
              onClick={() => handleTypeSelection(type as UserSecretType)}
            >
              {type}
            </Button>
          ))}
        </div>
        {/* Add more buttons for other secret types when they are implemented */}
      </div>
    );
  }

  if (step === 2 && secretType) {
    return (
      <div className="space-y-4">
        <h2>Create {secretType} Secret</h2>
        {renderForm(secretType)}
        <div className="flex justify-end">
          <Button form="create-secret-form" type="submit">
            Create
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

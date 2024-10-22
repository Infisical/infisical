import React, { useState } from "react";

import { Button } from "@app/components/v2";
import { USER_SECRET_FORMS } from "@app/hooks/api/userSecrets/constants";
import { LoginUserSecretForm } from "@app/hooks/api/userSecrets/login/form";
import { LoginUserSecret, UserSecretType } from "@app/hooks/api/userSecrets/types";

export const UserSecretForm: React.FC = () => {
  const [step, setStep] = useState(1);
  const [secretType, setSecretType] = useState<UserSecretType | null>(null);
  const [formData, setFormData] = useState<Partial<LoginUserSecret>>({});

  const handleTypeSelection = (type: UserSecretType) => {
    setSecretType(type);
    setStep(2);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
    // Here you would typically send the data to your API
  };

  if (step === 1) {
    return (
      <div>
        <h2 className="mb-4">Select User Secret Type</h2>
        <div className="grid grid-cols-2 gap-4">
          {USER_SECRET_FORMS.map((form) => (
            <Button
              key={form.type}
              className="justify-between"
              variant="outline_bg"
              onClick={() => handleTypeSelection(form.type as UserSecretType)}
            >
              {form.type}
            </Button>
          ))}
        </div>
        {/* Add more buttons for other secret types when they are implemented */}
      </div>
    );
  }

  if (step === 2 && secretType === UserSecretType.Login) {
    return (
      <form onSubmit={handleSubmit}>
        <h2>Login User Secret</h2>
        {LoginUserSecretForm.fields.map((field) => (
          <div key={field.name}>
            <label htmlFor={field.name}>{field.label}</label>
            <input
              type={field.type}
              id={field.name}
              name={field.name}
              value={formData[field.name as keyof LoginUserSecret] || ""}
              onChange={handleInputChange}
              required
            />
          </div>
        ))}
        <button type="submit">Submit</button>
      </form>
    );
  }

  return null;
};

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";

import { encryptData } from "./encryptionUtil";

interface SecretFormData {
  id?: string;
  title: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  content?: string;
}

interface InitialData extends SecretFormData {
  type: string;
}

interface AddSecretFormProps {
  onSubmit: (data: SecretFormData & { type: string }) => void;
  isSubmitting: boolean;
  initialData: InitialData;
}

export const AddSecretForm = ({ onSubmit, isSubmitting, initialData }: AddSecretFormProps) => {
  const [type, setType] = useState<string>(initialData?.type || "");
  const [formData, setFormData] = useState<SecretFormData>({
    title: initialData?.title || "",
    username: initialData?.username || "",
    password: initialData?.password || "",
    cardNumber: initialData?.cardNumber || "",
    expiryDate: initialData?.expiryDate || "",
    cvv: initialData?.cvv || "",
    content: initialData?.content || ""
  });

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setFormData({
        id: initialData.id|| "",
        title: initialData.title || "",
        username: initialData.username || "",
        password: initialData.password || "",
        cardNumber: initialData.cardNumber || "",
        expiryDate: initialData.expiryDate || "",
        cvv: initialData.cvv || "",
        content: initialData.content || ""
      });
    }
  }, [initialData]);

  const handleInputChange = (field: keyof SecretFormData, value: string) => {
    setFormData((prevFormData) => ({
      ...prevFormData,
      [field]: value
    }));
  };

  const renderFields = () => {
    switch (type) {
      case "web-login":
        return (
          <>
            <FormControl label="Username">
              <Input value={formData.username} onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange("username", e.target.value)} />
            </FormControl>
            <FormControl label="Password">
              <Input value={formData.password} onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange("password", e.target.value)} />
            </FormControl>
          </>
        );
      case "credit-card":
        return (
          <>
            <FormControl label="Card Number">
              <Input value={formData.cardNumber} onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange("cardNumber", e.target.value)} />
            </FormControl>
            <FormControl label="Expiry Date">
              <Input value={formData.expiryDate} onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange("expiryDate", e.target.value)} />
            </FormControl>
            <FormControl label="CVV">
              <Input value={formData.cvv} onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange("cvv", e.target.value)} />
            </FormControl>
          </>
        );
      case "secure-note":
        return (
          <FormControl label="Content">
              <Input value={formData.content} onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange("content", e.target.value)} />
            </FormControl>
        );
      default:
        return null;
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const encryptedData = {
      ...formData,
      password: formData.password ? encryptData(formData.password) : "",
      cardNumber: formData.cardNumber ? encryptData(formData.cardNumber) : "",
      cvv: formData.cvv ? encryptData(formData.cvv) : "",
      content: formData.content ? encryptData(formData.content) : ""
    };

    onSubmit({ type, ...encryptedData });
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormControl label="Type of Secret">
        <Select value={type} onValueChange={(value: string) => setType(value)} defaultValue="web-login">
          <SelectItem value="web-login">Web Login</SelectItem>
          <SelectItem value="credit-card">Credit Card</SelectItem>
          <SelectItem value="secure-note">Secure Note</SelectItem>
        </Select>
      </FormControl>
      <FormControl label="Title">
        <Input value={formData.title} onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange("title", e.target.value)} />
      </FormControl>
      {renderFields()}
      <Button type="submit" isDisabled={isSubmitting}>Add</Button>
    </form>
  );
};

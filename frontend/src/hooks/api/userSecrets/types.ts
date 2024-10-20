export type TUserSecrets = {
  id: string;
  user_id: string;
  organization_id: string;
  type: string;
  username: string;
  password: string;
  card_number: string;
  expiry_date: string;
  cvv:string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;

}



export type TCreateCredentialRequest = {
  userId: string;
  organizationId: string;
  credentialType: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  title?: string;
  content?: string;
};

export type TUpdateCredentialRequest = {
  id: string;
  credentialType: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  title?: string;
  content?: string;
};


export type TDeleteUserSecretRequest = {
  sharedSecretId: string;
};
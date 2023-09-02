interface CreateServiceAccountDto {
  organizationId: string;
  name: string;
  publicKey: string;
  expiresIn: number;
}

export default CreateServiceAccountDto;

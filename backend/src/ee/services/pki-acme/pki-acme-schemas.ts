import { z } from "zod";

// Directory endpoint
export const GetAcmeDirectorySchema = z.object({
  params: z.object({
    profileId: z.string().uuid()
  })
});

export const GetAcmeDirectoryResponseSchema = z.object({
  newNonce: z.string(),
  newAccount: z.string(),
  newOrder: z.string(),
  revokeCert: z.string()
});

// New Nonce endpoint
export const GetAcmeNewNonceSchema = z.object({
  params: z.object({
    profileId: z.string().uuid()
  })
});

// New Account endpoint
export const CreateAcmeAccountSchema = z.object({
  params: z.object({
    profileId: z.string().uuid()
  }),
  body: z.object({
    contact: z.array(z.string()).optional(),
    termsOfServiceAgreed: z.boolean().optional(),
    onlyReturnExisting: z.boolean().optional(),
    externalAccountBinding: z
      .object({
        protected: z.string(),
        payload: z.string(),
        signature: z.string()
      })
      .optional()
  })
});

export const CreateAcmeAccountResponseSchema = z.object({
  status: z.string(),
  contact: z.array(z.string()).optional(),
  orders: z.string().optional(),
  accountUrl: z.string()
});

// New Order endpoint
export const CreateAcmeOrderSchema = z.object({
  params: z.object({
    profileId: z.string().uuid()
  }),
  body: z.object({
    identifiers: z.array(
      z.object({
        type: z.string(),
        value: z.string()
      })
    ),
    notBefore: z.string().optional(),
    notAfter: z.string().optional()
  })
});

export const CreateAcmeOrderResponseSchema = z.object({
  status: z.string(),
  expires: z.string(),
  identifiers: z.array(
    z.object({
      type: z.string(),
      value: z.string()
    })
  ),
  authorizations: z.array(z.string()),
  finalize: z.string(),
  certificate: z.string().optional()
});

// Account Deactivation endpoint
export const DeactivateAcmeAccountSchema = z.object({
  params: z.object({
    profileId: z.string().uuid(),
    accountId: z.string()
  }),
  body: z.object({
    status: z.literal("deactivated")
  })
});

export const DeactivateAcmeAccountResponseSchema = z.object({
  status: z.string()
});

// List Orders endpoint
export const ListAcmeOrdersSchema = z.object({
  params: z.object({
    profileId: z.string().uuid(),
    accountId: z.string()
  })
});

export const ListAcmeOrdersResponseSchema = z.object({
  orders: z.array(z.string())
});

// Get Order endpoint
export const GetAcmeOrderSchema = z.object({
  params: z.object({
    profileId: z.string().uuid(),
    orderId: z.string()
  })
});

export const GetAcmeOrderResponseSchema = z.object({
  status: z.string(),
  expires: z.string().optional(),
  identifiers: z.array(
    z.object({
      type: z.string(),
      value: z.string()
    })
  ),
  authorizations: z.array(z.string()),
  finalize: z.string(),
  certificate: z.string().optional()
});

// Finalize Order endpoint
export const FinalizeAcmeOrderSchema = z.object({
  params: z.object({
    profileId: z.string().uuid(),
    orderId: z.string()
  }),
  body: z.object({
    csr: z.string()
  })
});

export const FinalizeAcmeOrderResponseSchema = z.object({
  status: z.string(),
  expires: z.string().optional(),
  identifiers: z.array(
    z.object({
      type: z.string(),
      value: z.string()
    })
  ),
  authorizations: z.array(z.string()),
  finalize: z.string(),
  certificate: z.string().optional()
});

// Download Certificate endpoint
export const DownloadAcmeCertificateSchema = z.object({
  params: z.object({
    profileId: z.string().uuid(),
    orderId: z.string()
  })
});

// Get Authorization endpoint
export const GetAcmeAuthorizationSchema = z.object({
  params: z.object({
    profileId: z.string().uuid(),
    authzId: z.string()
  })
});

export const GetAcmeAuthorizationResponseSchema = z.object({
  status: z.string(),
  expires: z.string().optional(),
  identifier: z.object({
    type: z.string(),
    value: z.string()
  }),
  challenges: z.array(
    z.object({
      type: z.string(),
      url: z.string(),
      status: z.string(),
      token: z.string(),
      validated: z.string().optional()
    })
  )
});

// Respond to Challenge endpoint
export const RespondToAcmeChallengeSchema = z.object({
  params: z.object({
    profileId: z.string().uuid(),
    authzId: z.string()
  })
});

export const RespondToAcmeChallengeResponseSchema = z.object({
  type: z.string(),
  url: z.string(),
  status: z.string(),
  token: z.string(),
  validated: z.string().optional(),
  error: z
    .object({
      type: z.string(),
      detail: z.string(),
      status: z.number()
    })
    .optional()
});

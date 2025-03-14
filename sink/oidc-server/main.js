import Provider from "oidc-provider";
import express from "express";

const configuration = {
  jwks: {
    keys: [
      {
        kty: "RSA",
        use: "sig",
        alg: "RS256",
        d: "EF2Kky61jzvMYQ_B6ImXzCsQ8uQzbFJrGnB2azlpr_CFStjjUVKP4EKrSCVEasD6SGNJV2QSiNJr7j05nvuGmHMKa__rbU8fqP4qbDahUgCgWOq-zS5tGK6Ifk4II_cZ_V1F-TnrvmcOKMWBiSV-p8i72KpXXucbHGNRwASVs7--M55wp_m1UsybI2jSQ4IgyvGzTnvMmQ_GsX-XoD8u0zGU_4eN3DGc8l6hdxxuSymH0fEeL1Aj0LoCj6teRGF37a2sBQdU6mkNNAuyyirkoDqGZCGJToQLqX4F1FafnzjeIgfdneRa-vuaV380Hhr2rorWnQyBqOO27M5O_VAkJbfRaWJVrXTJ69ZgkU4GPdeYdklVL0HkU6laziTNqNMeAjnt4m51sWokVyJpvdWcb_vJ4NSCsRo7kHOz7g-UvWTXa8UW0DTDliq_TJ3rN4Gv0vn9tBlFfaeuLPpK4VNmRRDRXY_fcuzlnQwYExL9a4V_vCyGmabdb7PrUFPBcjR5",
        dp: "SX52TkZEc_eLIk5gYrKjAC643LJIw1RxMBWWewRSGLn_rbrH1he3hy7AGDUV6Uon7zkNh9R5GBVuxmlluBRAGbrhIXAAf8sWeyma3F6FIAt-MH_VkfW5K2p88PLOyVGljlv8-Z3wzdKYOlDP4yFU18LqGMqaRSDLDGhILkuZhjLYA40sfYJeJTi_HVP5UyWL4ohayqUWCT2W3DgeDDThYHmufOaqlrSLhUst6uez_cDz0BXAYIZvUuPVL_n1-_px",
        dq: "K1KYU77I6yyPA2u32rc0exp_TCG59hhpWxrmXN8yTXWyq_xYBhCJA_nHdY8UV25Hmd7q0iX2i8y2cCAFNWA5UWiSiNg9-fKRLI2nz53IM4dGfssOLwUk66wzX8r_u3XiLZsO7XNNtQZdcZmF0YuNTtzEdiNDhaOyHiwwHgShL36WNmUn00mZR__G5Qk60VvI8vsbvJU9xRnWuEVS1wRgyD7v6Nl9nIxb8N7oibCdTJLmgnRXPWvArsW0cJ-NURfr",
        e: "AQAB",
        n: "2QwX-NBMkQYedGpbPvHL7Ca0isvfmLC7lSc8XSOCLmCUIf6Bk_pdCNx2kxsmT81IoA8CfvJLHQj5vWKoVDFMLfwo4IujvsC3m2IrEg6jERE-YHfC3W5jKZtmzQYpfx5vC2_XTmcyPigtyaNVsftGfycES3B_tvphNsFmQcJjVGOsJQXXqh_TDv6FMcH4m9pngyw6wfe3GgAKA0dRTSfD0h7wLdNCeuid53lLpkQypTNdZ6_PiCMu2gr_cH5M0MPZtBb2TW12_2zOabExK1lI5-HvdPtbMT4Qzs2nd2NkjcWmlbKRZzq6IzyWt7W2EnfZDsi61PHECtTb-EQN2icl8Wnsp-0Bw66yviAOj0gn3X5hRLx-TknT_PnWMou17l5GoAojKDezcTW0iLlrfs2ixFlY28u7WklUN8uYhHvwgON6fsdefG-3bPpiRLBPZ_tgXa4doALsCwfXu2oz0vYktk31A-UYv92uJsKSUbK0_8ODTN0rslCqCYN_1a_aVt2P",
        p: "--L5BX8juLlGJk8hdPgEUmJjD7SsZuMrdq3cSibkkbaWUE5CQQ7vhLPr2dWCS1jUnY9WyoCx9QCZvhTHjORX50ykkOyBso9VJjWvYPjsrPpF7_Y6V0dKlblDmbbmRT9BW-MgjbwTivu3c2OpMXh2XLF-FOTq3t3Brs7SRnhTkD6GBDFf3X95J0PF7NELa9z2-kzPSDYz3k-9FepXnRPBM_ViDzlRw4eKUdylVuhzGbC2TRSmab9BRP0wipQKd-f5",
        q: "3Jd5CRJpQV3xUi3FiHHAwcjfsRkfXMrxfaXt0PjX2xWzxscYiDcyCF6VhHTAGsiq5SOtCp3l5mg6A9PzdR53AzM2-706D82fMwiUZvsLOVTepXkgriP_xw7rDlkOeAvjB80sL2G9scFliTzzRZ8I8E79A8DxZihfB75AIN9ijklEihnwxfhp2EgO5MYEyQRcqU1TT8wD8ekLMzd-kJUWyTz3BogiVJH__BQoB6kaDyjvQoxBgwh0hi72t9H5XqPH",
        qi: "cwK0jhzwbu8BaTmTQhwfGiqwNN3v9F4nUQ4dtnBYRI6zlki4cLb2Mf9-VhyEsUYhhdTm8R7RwO9m5Xct3gEfozdk35wuvkVwkZgL3Uho5asao0xi4aENeUk5DCkU-paO3yLSDhIs9YYuYIDjUX6QuMCPjomypuE3SRm-Dg1PGOxYvX3w_P-0kd5iBFrm4jwGTZViFOr8tl_dXgDRDWDgofOYOYcmUv2_0zt1aO3j5dhEpwdkyuDMLfVZNpJQyopJ",
        kid: "f262a3214213d194c92991d6735b153b",
      },
    ],
  },
  features: {
    clientCredentials: {
      enabled: true,
    },
    introspection: {
      enabled: true,
    },
    resourceIndicators: {
      enabled: true,
      getResourceServerInfo(ctx, resourceIndicator) {
        if (resourceIndicator === "urn:api") {
          return {
            scope: "read",
            audience: "urn:api",
            accessTokenTTL: 1 * 60 * 60, // 1 hour
            accessTokenFormat: "jwt",
          };
        }

        throw new errors.InvalidTarget();
      },
    },
  },
  clients: [
    {
      client_id: "app",
      client_secret: "a_secret",
      grant_types: ["client_credentials"],
      redirect_uris: [],
      response_types: [],
    },
    {
      client_id: "oidc_client",
      client_secret: "a_different_secret",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      redirect_uris: ["http://localhost:3001/cb"],
    },
  ],
  claims: {
    profile: [
      "birthdate",
      "family_name",
      "gender",
      "given_name",
      "locale",
      "middle_name",
      "name",
      "nickname",
      "picture",
      "preferred_username",
      "profile",
      "updated_at",
      "website",
      "zoneinfo",
    ],
    email: ["email", "email_verified"],
  },
};

const oidc = new Provider("http://localhost:3000", configuration);

const app = express();
app.use("/oidc", oidc.callback());
app.listen(3000);

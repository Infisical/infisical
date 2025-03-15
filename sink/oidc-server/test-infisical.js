import axios from "axios";
import { Buffer } from "buffer";
import querystring from "querystring";

// Configuration
const config = {
  issuer: "http://localhost:3000/oidc",
  tokenEndpoint: "http://localhost:3000/oidc/token",
  clientId: "app",
  clientSecret: "a_secret",
};

// Client credentials flow for machine identity
async function getMachineToken() {
  try {
    // Use application/x-www-form-urlencoded format as required by the OIDC spec
    const data = querystring.stringify({
      grant_type: "client_credentials",
      scope: "read",
      resource: "urn:api",
    });

    const authHeader =
      "Basic " +
      Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
        "base64",
      );

    const response = await axios.post(config.tokenEndpoint, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
    });

    console.log("Successfully obtained token:");
    console.log("Access Token:", response.data.access_token);
    console.log("Token Type:", response.data.token_type);
    console.log("Expires In:", response.data.expires_in, "seconds");
    console.log("Scope:", response.data.scope);

    return response.data;
  } catch (error) {
    console.error("Error obtaining token:");
    if (error.response && error.response.data) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

// Test the machine identity authentication
async function testMachineIdentity() {
  try {
    // Get token using client credentials
    const token = await getMachineToken();

    const loginData = querystring.stringify({
      identityId: "5d81d5cc-602f-4af7-b242-ab7c1331b430",
      jwt: token.access_token,
    });

    const response = await axios({
      method: "post",
      url: `http://localhost:8080/api/v1/auth/oidc-auth/login`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: loginData,
    });
    console.log(response.data);
  } catch (error) {
    console.error("Error in test:", error.message);
  }
}

// Run the test
testMachineIdentity();

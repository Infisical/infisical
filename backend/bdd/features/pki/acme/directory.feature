Feature: Directory

  Scenario: Get the directory of ACME service urls
    Given I have an ACME cert profile as "acme_profile"
    When I send a "GET" request to "/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then the response status code should be "200"
    And the response body should match JSON value
      """
      {
        "newNonce": "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/new-nonce",
        "newAccount": "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/new-account",
        "newOrder": "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/new-order",
        "meta": {
          "externalAccountRequired": true
        }
      }
      """

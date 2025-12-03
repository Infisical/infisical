Feature: Order

  Scenario: Create a new order
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    Then I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And the value order.uri with jq "." should match pattern {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/orders/(.+)
    And the value order.body with jq ".status" should be equal to "pending"
    And the value order.body with jq ".identifiers" should be equal to [{"type": "dns", "value": "localhost"}]
    And the value order.body with jq ".finalize" should match pattern {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/orders/(.+)/finalize
    And the value order.body with jq "all(.authorizations[]; startswith("{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/authorizations/"))" should be equal to true

  Scenario: Create a new order with SANs
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    And I add subject alternative name to certificate signing request csr
      """
      [
        "example.com",
        "infisical.com"
      ]
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And the value order.body with jq ".identifiers | sort_by(.value)" should be equal to json
      """
      [
        {"type": "dns", "value": "example.com"},
        {"type": "dns", "value": "infisical.com"},
        {"type": "dns", "value": "localhost"}
      ]
      """

  Scenario: Fetch an order
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    Then I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I send an ACME post-as-get to order.uri as fetched_order
    And the value fetched_order with jq ".status" should be equal to "pending"
    And the value fetched_order with jq ".identifiers" should be equal to [{"type": "dns", "value": "localhost"}]
    And the value fetched_order with jq ".finalize" should match pattern {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/orders/(.+)/finalize
    And the value fetched_order with jq "all(.authorizations[]; startswith("{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/authorizations/"))" should be equal to true

  Scenario Outline: Create an order with invalid identifier types
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I peak and memorize the next nonce as nonce
    When I send a raw ACME request to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-order"
    """
    {
      "protected": {
        "alg": "RS256",
        "nonce": "{nonce}",
        "url": "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-order",
        "kid": "{acme_account.uri}"
      },
      "payload": {
        "identifiers": [
           { "type": "<identifier_type>", "value": "www.example.org" }
         ]
      }
    }
    """

    Then the value response.status_code should be equal to 400
    And the value response with jq ".status" should be equal to 400
    And the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:unsupportedIdentifier"
    And the value response with jq ".detail" should be equal to "Only DNS identifiers are supported"

    Examples: Bad Identifier Types
      | identifier_type |
      | bad             |
      | ip              |
      | email           |

  Scenario Outline: Create an order with invalid identifier values
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I peak and memorize the next nonce as nonce
    When I send a raw ACME request to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-order"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-order",
          "kid": "{acme_account.uri}"
        },
        "payload": {
          "identifiers": [
             { "type": "dns", "value": "<identifier_value>" }
           ]
        }
      }
      """

    Then the value response.status_code should be equal to 400
    And the value response with jq ".status" should be equal to 400
    And the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:unsupportedIdentifier"
    And the value response with jq ".detail" should be equal to "Invalid DNS identifier"

    Examples: Bad Identifier Vluaes
      | identifier_value |
      | 127.0.0.1        |
      | 192.168.123.111  |
      | 169.254.169.254  |
      | ../../etc/passwd |
      | !@#$             |
      | !                |
      | https://evil.com |


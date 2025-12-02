Feature: Challenge

  Scenario: Validate challenge
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
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I select challenge with type http-01 for domain localhost from order in order as challenge
    And I serve challenge response for challenge at localhost
    And I tell ACME server that challenge is ready to be verified
    And I poll and finalize the ACME order order as finalized_order
    And the value finalized_order.body with jq ".status" should be equal to "valid"
    And I parse the full-chain certificate from order finalized_order as cert
    And the value cert with jq ".subject.common_name" should be equal to "localhost"

  Scenario: Validate challenge with retry
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
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I select challenge with type http-01 for domain localhost from order in order as challenge
    And I wait 45 seconds and serve challenge response for challenge at localhost
    And I tell ACME server that challenge is ready to be verified
    And I poll and finalize the ACME order order as finalized_order
    And the value finalized_order.body with jq ".status" should be equal to "valid"
    And I parse the full-chain certificate from order finalized_order as cert
    And the value cert with jq ".subject.common_name" should be equal to "localhost"

  Scenario: Validate challenges for multiple domains
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
        "infisical.com",
        "example.com"
      ]
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I pass all challenges with type http-01 for order in order
    And I poll and finalize the ACME order order as finalized_order
    And the value finalized_order.body with jq ".status" should be equal to "valid"
    And I parse the full-chain certificate from order finalized_order as cert
    And the value cert with jq ".subject.common_name" should be equal to "localhost"
    And the value cert with jq "[.extensions.subjectAltName.general_names.[].value] | sort" should be equal to json
      """
      [
        "example.com",
        "infisical.com"
      ]
      """

  Scenario: Did not finish all challenges
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
        "infisical.com"
      ]
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I select challenge with type http-01 for domain localhost from order in order as challenge
    And I serve challenge response for challenge at localhost
    And I tell ACME server that challenge is ready to be verified

    # the localhost auth should be valid
    And I memorize order with jq ".authorizations | map(select(.body.identifier.value == "localhost")) | first | .uri" as localhost_auth
    And I peak and memorize the next nonce as nonce
    When I send a raw ACME request to "{localhost_auth}"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "{localhost_auth}",
          "kid": "{acme_account.uri}"
        }
      }
      """
    Then the value response.status_code should be equal to 200
    And the value response with jq ".status" should be equal to "valid"

    # the infisical.com auth should still be pending
    And I memorize order with jq ".authorizations | map(select(.body.identifier.value == "infisical.com")) | first | .uri" as infisical_auth
    And I memorize response.headers with jq ".["replay-nonce"]" as nonce
    When I send a raw ACME request to "{infisical_auth}"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "{infisical_auth}",
          "kid": "{acme_account.uri}"
        }
      }
      """
    Then the value response.status_code should be equal to 200
    And the value response with jq ".status" should be equal to "pending"

    # the order should be pending as well
    And I memorize response.headers with jq ".["replay-nonce"]" as nonce
    When I send a raw ACME request to "{order.uri}"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "{order.uri}",
          "kid": "{acme_account.uri}"
        }
      }
      """
    Then the value response.status_code should be equal to 200
    And the value response with jq ".status" should be equal to "pending"

    # finalize should not be allowed when all auths are not valid yet
    And I memorize response.headers with jq ".["replay-nonce"]" as nonce
    When I send a raw ACME request to "{order.body.finalize}"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "{order.body.finalize}",
          "kid": "{acme_account.uri}"
        },
        "payload": {
          "csr": "{csr_pem}"
        }
      }
      """
    Then the value response.status_code should be equal to 400
    Then the value response with jq ".status" should be equal to 400
    Then the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:orderNotReady"
    Then the value response with jq ".detail" should be equal to "ACME order is not ready"

  Scenario: CSR names mismatch with order identifier
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "example.com"
      }
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    Then I peak and memorize the next nonce as nonce
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
           { "type": "dns", "value": "localhost" },
           { "type": "dns", "value": "infisical.com" }
          ]
        }
      }
      """
    Then the value response.status_code should be equal to 201
    And I memorize response with jq ".finalize" as finalize_url
    And I memorize response.headers with jq ".["replay-nonce"]" as nonce
    And I memorize response.headers with jq ".["location"]" as order_uri
    And I memorize response as order
    And I pass all challenges with type http-01 for order in order
    And I wait until the status of order order_uri becomes ready
    And I encode CSR csr_pem as JOSE Base-64 DER as base64_csr_der
    When I send a raw ACME request to "{finalize_url}"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "{finalize_url}",
          "kid": "{acme_account.uri}"
        },
        "payload": {
          "csr": "{base64_csr_der}"
        }
      }
      """
    Then the value response.status_code should be equal to 400
    And the value response with jq ".status" should be equal to 400
    And the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:badCSR"
    And the value response with jq ".detail" should be equal to "Invalid CSR: Common name + SANs mismatch with order identifiers"

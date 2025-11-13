Feature: External CA

  Scenario: Issue a certificate from an external CA
    Given I create a Cloudflare connection as cloudflare
    Then I memorize cloudflare with jq ".appConnection.id" as app_conn_id
    Given I create a external ACME CA with the following config as ext_ca
      """
      {
        "dnsProviderConfig": {
            "provider": "cloudflare",
            "hostedZoneId": "MOCK_ZONE_ID"
        },
        "directoryUrl": "{PEBBLE_URL}",
        "accountEmail": "fangpen@infisical.com",
        "dnsAppConnectionId": "{app_conn_id}",
        "eabKid": "",
        "eabHmacKey": ""
      }
      """
    Then I memorize ext_ca with jq ".id" as ext_ca_id
    Given I create a certificate template with the following config as cert_template
      """
      {
        "subject": [
          {
            "type": "common_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "sans": [
          {
            "type": "dns_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "keyUsages": {
          "required": [],
          "allowed": [
            "digital_signature",
            "key_encipherment",
            "non_repudiation",
            "data_encipherment",
            "key_agreement",
            "key_cert_sign",
            "crl_sign",
            "encipher_only",
            "decipher_only"
          ]
        },
        "extendedKeyUsages": {
          "required": [],
          "allowed": [
            "client_auth",
            "server_auth",
            "code_signing",
            "email_protection",
            "ocsp_signing",
            "time_stamping"
          ]
        },
        "algorithms": {
          "signature": [
            "SHA256-RSA",
            "SHA512-RSA",
            "SHA384-ECDSA",
            "SHA384-RSA",
            "SHA256-ECDSA",
            "SHA512-ECDSA"
          ],
          "keyAlgorithm": [
            "RSA-2048",
            "RSA-4096",
            "ECDSA-P384",
            "RSA-3072",
            "ECDSA-P256",
            "ECDSA-P521"
          ]
        },
        "validity": {
          "max": "365d"
        }
      }
      """
    Then I memorize cert_template with jq ".certificateTemplate.id" as cert_template_id
    Given I create an ACME profile with ca {ext_ca_id} and template {cert_template_id} as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    # Pebble has a strict rule to only takes SANs
    Then I add subject alternative name to certificate signing request csr
      """
      [
        "localhost"
      ]
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I select challenge with type http-01 for domain localhost from order in order as challenge
    And I serve challenge response for challenge at localhost
    And I tell ACME server that challenge is ready to be verified
    Given I intercept outgoing requests
      """
      [
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "POST",
          "path": "/client/v4/zones/MOCK_ZONE_ID/dns_records",
          "status": 200,
          "response": {
              "result": {
                  "id": "A2A6347F-88B5-442D-9798-95E408BC7701",
                  "name": "Mock Account",
                  "type": "standard",
                  "settings": {
                      "enforce_twofactor": false,
                      "api_access_enabled": null,
                      "access_approval_expiry": null,
                      "abuse_contact_email": null,
                      "user_groups_ui_beta": false
                  },
                  "legacy_flags": {
                      "enterprise_zone_quota": {
                          "maximum": 0,
                          "current": 0,
                          "available": 0
                      }
                  },
                  "created_on": "2013-04-18T00:41:02.215243Z"
              },
              "success": true,
              "errors": [],
              "messages": []
          },
          "responseIsBinary": false
        },
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "GET",
          "path": {
            "regex": "/client/v4/zones/[^/]+/dns_records\\?"
          },
          "status": 200,
          "response": {
            "result": [],
            "success": true,
            "errors": [],
            "messages": [],
            "result_info": {
              "page": 1,
              "per_page": 100,
              "count": 0,
              "total_count": 0,
              "total_pages": 1
            }
          },
          "responseIsBinary": false
        }
      ]
      """
    Then I poll and finalize the ACME order order as finalized_order
    And the value finalized_order.body with jq ".status" should be equal to "valid"
    And I parse the full-chain certificate from order finalized_order as cert
    # Note: somehow Pebble is issuing a cert without common name but just SANs
    And the value cert with jq "[.extensions.subjectAltName.general_names.[].value] | sort" should be equal to json
      """
      [
        "localhost"
      ]
      """
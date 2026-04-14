Feature: Renewal

  Scenario: Successful cert-based renewal with previously issued certificate
    Given I have a SCEP cert profile with config as "scep_profile"
      """
      { "challengePassword": "testpassword123", "allowCertBasedRenewal": true }
      """
    And I perform a successful SCEP enrollment for CN "renew-device.example.com" with challenge "testpassword123" on profile "scep_profile"
    When I renew via SCEP for CN "renew-device.example.com" on profile "scep_profile" using the previously issued certificate
    Then the SCEP enrollment should succeed
    And the issued SCEP certificate subject CN should be "renew-device.example.com"

  Scenario: Renewal denied when cert-based renewal is disabled
    Given I have a SCEP cert profile with config as "scep_profile"
      """
      { "challengePassword": "testpassword123", "allowCertBasedRenewal": false }
      """
    And I perform a successful SCEP enrollment for CN "deny-device.example.com" with challenge "testpassword123" on profile "scep_profile"
    When I renew via SCEP for CN "deny-device.example.com" on profile "scep_profile" using the previously issued certificate
    Then the SCEP enrollment should fail

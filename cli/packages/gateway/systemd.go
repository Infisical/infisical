package gateway

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/rs/zerolog/log"
)

const systemdServiceTemplate = `[Unit]
Description=Infisical Gateway Service
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/infisical/gateway.conf
ExecStart=infisical gateway
Restart=on-failure
InaccessibleDirectories=/home
PrivateTmp=yes
LimitCORE=infinity
LimitNOFILE=1000000
LimitNPROC=60000
LimitRTPRIO=infinity
LimitRTTIME=7000000

[Install]
WantedBy=multi-user.target
`

func InstallGatewaySystemdService(token string, domain string) error {
	if runtime.GOOS != "linux" {
		log.Info().Msg("Skipping systemd service installation - not on Linux")
		return nil
	}

	if os.Geteuid() != 0 {
		log.Info().Msg("Skipping systemd service installation - not running as root/sudo")
		return nil
	}

	configDir := "/etc/infisical"
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %v", err)
	}

	configContent := fmt.Sprintf("INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN=%s\n", token)
	if domain != "" {
		configContent += fmt.Sprintf("INFISICAL_API_URL=%s\n", domain)
	} else {
		configContent += "INFISICAL_API_URL=\n"
	}

	configPath := filepath.Join(configDir, "gateway.conf")
	if err := os.WriteFile(configPath, []byte(configContent), 0600); err != nil {
		return fmt.Errorf("failed to write config file: %v", err)
	}

	servicePath := "/etc/systemd/system/infisical-gateway.service"
	if _, err := os.Stat(servicePath); err == nil {
		log.Info().Msg("Systemd service file already exists")
		return nil
	}

	if err := os.WriteFile(servicePath, []byte(systemdServiceTemplate), 0644); err != nil {
		return fmt.Errorf("failed to write systemd service file: %v", err)
	}

	reloadCmd := exec.Command("systemctl", "daemon-reload")
	if err := reloadCmd.Run(); err != nil {
		return fmt.Errorf("failed to reload systemd: %v", err)
	}

	log.Info().Msg("Successfully installed systemd service")
	log.Info().Msg("To start the service, run: sudo systemctl start infisical-gateway")
	log.Info().Msg("To enable the service on boot, run: sudo systemctl enable infisical-gateway")

	return nil
}

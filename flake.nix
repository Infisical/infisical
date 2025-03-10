{
  description = "Flake for github:Infisical/infisical repository.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
  };

  outputs = { self, nixpkgs }: {
    devShells.aarch64-darwin.default = let
      pkgs = nixpkgs.legacyPackages.aarch64-darwin;
    in
      pkgs.mkShell {
        packages = with pkgs; [
          git
          lazygit

          nodejs_20
        ];

        shellHook = ''
          # Define a writable directory for global npm packages
          export NPM_CONFIG_PREFIX="$HOME/.npm-global"
          export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"

          # Ensure the directory exists
          mkdir -p "$NPM_CONFIG_PREFIX"

          # Install Infisical CLI only if it's not already installed
          if ! command -v infisical &>/dev/null; then
            npm install -g @infisical/cli
          fi
        '';
      };
  };
}

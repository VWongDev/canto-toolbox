{
  description = "Canto Toolbox - Chrome extension for Chinese word definitions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_20
            pnpm
          ];

          shellHook = ''
            echo "canto-toolbox dev shell"
            echo "node $(node --version) | pnpm $(pnpm --version)"
          '';
        };
      });
}

#!/usr/bin/env bash
set -euo pipefail

# O download acontece apenas na preparação. O XML do usuário nunca entra neste script.
readonly commit=8d79e6b2f7fad6375340afcb51c85ed370c64a14
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
go version >/dev/null || { echo "Instale o compilador Go 1.27 ou superior." >&2; exit 1; }
git -C "$work" init -q source
git -C "$work/source" fetch -q --depth 1 https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse.git "$commit"
git -C "$work/source" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$work/source" rev-parse HEAD)" = "$commit"
cd "$work/source"
mkdir -p "$work/engine"
export GOOS=js GOARCH=wasm CGO_ENABLED=0 GOTOOLCHAIN=local
go build -mod=readonly -trimpath -buildvcs=false -ldflags="-s -w" -o "$work/danfse.wasm" ./cmd/danfse-wasm
gzip -n -9 -c "$work/danfse.wasm" > "$work/engine/danfse.wasm.gz"
go mod verify
goroot=$(go env GOROOT)
cp "$goroot/lib/wasm/wasm_exec.js" "$work/engine/"
cp "$goroot/LICENSE" "$work/engine/LICENSE-Go.txt"
cp LICENSE "$work/engine/LICENSE-DANFSe.txt"
go list -mod=readonly -deps -f '{{with .Module}}{{if not .Main}}{{.Path}}|{{.Dir}}{{end}}{{end}}' ./cmd/danfse-wasm | sort -u > "$work/modules"
while IFS='|' read -r module module_dir; do
  [[ -z "$module_dir" ]] && continue
  printf '\n%s\n' "$module"
  find "$module_dir" -maxdepth 2 -type f \( -iname 'license*' -o -iname 'notice*' -o -iname 'copying*' \) -print0 | sort -z | xargs -0 -r cat
done < "$work/modules" > "$work/engine/THIRD-PARTY.txt"
{
  go version
  go list -deps -mod=readonly -f '{{with .Module}}{{.Path}} {{.Version}}{{end}}' ./cmd/danfse-wasm | sort -u
  printf 'Fonte: https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/commit/%s\n' "$commit"
  (cd "$work" && sha256sum danfse.wasm)
} > "$work/engine/BUILD.txt"
(cd "$work/engine" && sha256sum BUILD.txt LICENSE-*.txt THIRD-PARTY.txt danfse.wasm.gz wasm_exec.js > SHA256SUMS && sha256sum -c SHA256SUMS)
node "$root/scripts/testar-motor-wasm.mjs" "$work/engine" "$work/exemplo-danfse.pdf"
mkdir -p "$root/public/engine"
cp -R "$work/engine/." "$root/public/engine/"
cp "$work/exemplo-danfse.pdf" "$root/public/exemplo-danfse.pdf"
echo "Motor da Receita e PDF fictício prontos."

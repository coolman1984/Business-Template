#!/bin/sh
# Double-click (macOS) or run ./start-webapp.command (Linux) to run the business web app locally.
# Needs Node.js 22 or newer: https://nodejs.org
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org then run this file again."
  read -r _
  exit 1
fi
echo "Installing / checking packages..."
npx --yes pnpm@10.33.0 install --frozen-lockfile || { echo "Package installation failed. See the messages above."; read -r _; exit 1; }
exec npx --yes pnpm@10.33.0 local

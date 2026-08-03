#!/bin/bash
set -e

VPS_USER="root"
VPS_HOST="89.117.32.70"
VPS_PATH="/opt/dashboard/dist"

echo "Building..."
npm run build

echo "Uploading to VPS..."
rsync -az --delete dist/ "$VPS_USER@$VPS_HOST:$VPS_PATH/"

echo "Done! https://dashboard.srv1816822.hstgr.cloud"

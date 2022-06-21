#!/bin/bash
set -e

npm run build
npm run export
scp -r out/* aray:/var/www/frogger

# This hoses local development, so nuke the folder after
rm -rf .next

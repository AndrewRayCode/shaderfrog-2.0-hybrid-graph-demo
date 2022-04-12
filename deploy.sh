#!/bin/bash
set -e

npm run build
npm run export
scp -r out/* aray:/var/www/frogger

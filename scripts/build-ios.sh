#!/usr/bin/env bash
# Run on a Mac or a Microsoft-hosted macOS agent. These are unsigned build
# artifacts; this script does not sign, upload to Apple or start TestFlight.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/ios-delivery
{
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  git rev-parse HEAD
  node --version
  xcodebuild -version
  xcodebuild -showsdks
  sw_vers
} > build/ios-delivery/toolchain.txt
npm ci
npm run mobile:sync -- ios
npm run check
node scripts/release-preflight.mjs > build/ios-delivery/source-preflight.json
node -e "const b=require('fs').readFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');if(b[25]!==2)throw Error('The App Store icon must use RGB without alpha')"
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/BrickBreaker.xcarchive CODE_SIGNING_ALLOWED=NO archive
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/simulator CODE_SIGNING_ALLOWED=NO build
test -f build/BrickBreaker.xcarchive/Products/Applications/App.app/PrivacyInfo.xcprivacy
plutil -lint build/BrickBreaker.xcarchive/Products/Applications/App.app/PrivacyInfo.xcprivacy
ditto -c -k --keepParent build/BrickBreaker.xcarchive build/ios-delivery/BrickBreaker-iOS-unsigned-archive.zip
ditto -c -k --keepParent build/simulator/Build/Products/Debug-iphonesimulator/App.app build/ios-delivery/BrickBreaker-iOS-simulator.zip
(
  cd build/ios-delivery
  shasum -a 256 ./*.zip > SHA256SUMS.txt
)

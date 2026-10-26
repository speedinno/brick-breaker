# Ad build configuration (implementation draft)

This is the build/operator reference. The owner requested the complete account-creation guide after implementation; provider accounts, published messages, real callbacks and device validation are still outstanding. The default checkout has ads disabled and excludes the native AdMob plugin.

## Public profile

Copy `.env.ads.example.json` to an ignored `.env.ads.json`. It contains **public configuration only**, never provider API keys. The example uses Google's demo App IDs, leaves audience and consent review false and therefore cannot request ads. Android and iOS App IDs use `~`; ad unit IDs use `/` and belong in the backend placement configuration instead.

```powershell
npm run configure:ads -- --file .env.ads.json
npm run mobile:sync
```

The command validates the entire profile before writing. It manages public runtime settings, separate Capacitor plugin lists for Android/iOS, the Android App ID and delayed measurement flag, and the iOS App ID/delayed measurement/SKAdNetwork entries. An Android-only profile never registers the iOS plugin. Unknown fields, private-key fields, ad-unit-as-App-ID substitution, publisher/CMP mismatches and unmanaged existing native IDs fail without overwriting them. Production rejects Google demo IDs and requires explicit audience/consent review. Review flags record an operator decision, not legal approval or a substitute for device/provider verification.

To return to the default build:

```powershell
npm run configure:ads -- --disable
npm run mobile:sync
```

Always sync after changing the profile. Android pre-build rejects a registered AdMob plugin without its native App ID. The default build has no App ID and no registered AdMob plugin. Android native dependencies are pinned at Google Mobile Ads 25.4.0 and UMP 4.0.0. The installed AdMob 8.2.1 plugin pins its iOS Google Mobile Ads dependency at 13.11.0 and UMP within 3.1.x. iOS compilation/signing still requires Xcode on a Mac.

## Owned-browser configuration

A `web` entry has `publisherId`, `cmpScriptUrl`, `origins` and `consentReviewed`. Copy the official Google Privacy & messaging tag URL for that exact publisher; it must use `https://fundingchoicesmessages.google.com/i/pub-<publisher digits>` with an optional `?ers=1`. No arbitrary remote script is accepted. Origins must be exact HTTPS origins; sandbox localhost HTTP is allowed. The public profile may contain only the platforms being prepared.

The browser bridge loads that CMP only after an eligible player deliberately prepares an ad. Configure and publish Google's applicable messages, including consent-mode support for all three ad purposes and applicable US messages. The bridge rejects denied, unknown and unconfigured signals; it does not require analytics consent or load analytics tags. It checks current GPP 1.1 `ping` data on each opportunity, rather than using the initial US state once forever. Global Privacy Control, opt-outs, known-child signals and unsupported/unknown applicable sections prevent a new H5 request. EU purpose decisions use Google's consent-mode signals. Google/H5 still receives the provider's standard encoded consent signals; this conservative application gate is not a replacement CMP or a compliance certification.

European choices reopen from the optional-ad section when applicable. Keep Google's own default Do not sell or share entry enabled; this release does not override it with an Ad Manager-only API. Confirm that entry is actually rendered and usable on the owned site in relevant geographies before activating production. The game remains paused/muted while a consent form is visible, and consent acceptance never opens an ad automatically. The player must prepare again and then explicitly select Watch.

Sources: [Google Privacy & messaging API](https://developers.google.com/funding-choices/fc-api-docs), [GPP CMP API 1.1](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Core/CMP%20API%20Specification.md), [AdMob plugin configuration](https://github.com/capacitor-community/admob/blob/main/README.md).

## Backend and release gates

An enabled client profile does not create a server offer. The backend separately requires a matching `MONETIZATION_ENVIRONMENT`, `REWARDED_ADS_CONFIG_JSON`, immutable active placement rows and the real native SSV endpoint configuration. Ad unit reward amount/item and SSV verification-unit representation must be checked against an actual Google callback. Staging must use its own Supabase database. Test ads do not prove SSV; the game has no signature bypass or client-granted native credits.

Apply all migrations through `202610270015_operational_recovery.sql` to the intended environment before deploying the latest client/API/worker version. Do not rerun the two manually applied baseline migrations. Ordered account-bound wallet snapshots keep stale responses from overwriting newer debits/refunds/grants. Older server responses are accepted only until a client instance has seen its first versioned snapshot; they cannot overwrite a versioned response. Reservations, not displayed balances, remain spending authority.

Google retries native SSV for a short interval. The current Azure API can cold-start more slowly than that interval. A dedicated `reward-callback` Supabase Edge Function and bounded durable recovery worker are now implemented; see [operational recovery](OPERATIONAL-RECOVERY.md). They have not yet been deployed/measured against Google, so reliable callback delivery and a running schedule/monitoring remain activation requirements. This does not purchase an always-on resource or claim the current zero-minimum container is ready for ad callbacks. SDK privacy/store disclosures must match enabled SDK behavior, including identifiers and diagnostic data. Review [Google's Data safety guidance](https://developers.google.com/admob/android/privacy/play-data-disclosure) against the exact shipped SDK/configuration.

## Evidence so far

- Actual Android AdMob SDK integration compiled: `assembleDebug`, 217 tasks, 2m28s. Demo App IDs, review flags false, no ad requests. Local internal artifact: `.openai/local/product-redesign/brickbreaker-admob-sdk-check.apk`, SHA-256 `716e0d841ce009a16fda722f7b1f95f4246d83e2cb37fd0b96c6d23b8d7e5903`.
- iOS plugin/SPM configuration synchronized and Windows paths normalized; no Xcode build, signature or iPhone run claimed.
- Profile tests cover validation, platform isolation, idempotent updates, exact restoration on disable and preservation of unmanaged configuration.
- The real browser consent bridge passed five grouped checks with a local mock CMP and real PostgreSQL: no unsolicited UI, refusal without losing a reward slot, reopening/waiting for privacy changes, no automatic ad after acceptance and explicit cancellation. These are mock callbacks, not Google publisher approval or real consent-geography evidence.

After validation the default disabled profile and three-plugin native registration were restored. No public APK, production database or production API was changed.

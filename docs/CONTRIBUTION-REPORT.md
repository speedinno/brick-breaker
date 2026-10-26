# Reviewed cohort contribution

This private operator tool calculates observed-window contribution from reviewed aggregate evidence. It does not fetch a publisher settlement, infer acquisition identity, authenticate a report or certify accounting/tax treatment. No real cohort, provider report, acquisition invoice or support/content bill has been supplied or analysed. The included example deliberately returns **incomplete**, with no invented revenue or cost.

## Prepare actual inputs

Copy [the incomplete template](examples/contribution-input.example.json) into the ignored `.openai/local/` directory. Keep all real source reports, invoices, reviews and outputs private. Set actual acquisition cohort day, platform, reported country (null if unknown), and D7 or D30 window. A D7 window covers day 0 through day 6; D30 covers day 0 through day 29. `asOf` is a UTC date boundary: the whole window must have closed before a complete result is possible. Future as-of dates are rejected by the CLI.

Choose the denominator honestly. `reviewed_unique_acquired_players` needs independent acquisition evidence and deduplication of known linked players; it cannot be selected just because that metric is preferred. Store install events can include reinstalls/multiple devices and stay `store_install_events`. Optional account reports stay `consenting_accounts`. Unknown counts remain null. Neither alternative produces `netContributionPerNewPlayer`.

Use `cohort_measured` only when proceeds and costs are attributed to that actual acquisition cohort and exact observation window. A calendar-day publisher/store total contains old and new players; allocating it to a cohort is an estimate (`allocated_calendar_total`). Do not join it by date and call it measured new-player revenue. The app's optional account sample cannot reconstruct all anonymous acquisition activity. Keep attribution assumptions in the private reviewed source record.

Add every component explicitly:

| Component | Required meaning |
|---|---|
| `adProceeds` | Publisher net proceeds for the attributed cohort/window; classify estimates as estimates. Do not subtract another ad-network share. SDK callback value and SSV reward counts are not finalized proceeds. |
| `purchaseProceeds` | Net after store/processor deductions, refunds and applicable adjustments. Use the provider report's real basis; do not subtract fees a second time. Existing `report:commercial` API estimates stay estimates until reconciled. |
| `acquisitionCost` | Actual attributable acquisition spend; organic acquisition is zero only with a reviewed basis. |
| `hostingCost` | Attributable variable hosting/API/database/delivery charges. Total subscription/fixed cost is not automatically this window's variable cost. |
| `supportCost`, `contentCost` | Attributable variable support/content costs under a documented allocation. Missing effort/cost records are unknown. |
| `additionalMerchantTax` | Only incremental merchant liabilities not already deducted in net proceeds; obtain the correct business accounting treatment and avoid double deduction. |

Amounts are **decimal strings of millionths of their own currency**. For example, INR 1.29 is `"1290000"`. Costs must be nonnegative; net proceeds may be negative after adjustments. Missing values use `micros:null`, `coverage:"unknown"`. Partial reports use `coverage:"partial"` with only their known amount. An explicitly reviewed zero uses `"0"` with a real proof reference. Estimated reports/allocations use `finality:"estimate"`; a current-price hypothesis is not a historical monetary observation. The tool never invents an exchange rate. Mixed currencies yield separate known subtotals and no complete combined result; any outside conversion needs an auditable source and the appropriate estimate classification.

Each known count or amount references one or more entries in `evidence`. An input evidence entry has exactly `id`, `kind`, `path`, and `sha256`. IDs use lowercase letters/numbers/underscore/hyphen. Kinds are `publisher_report`, `purchase_report`, `acquisition_report`, `cost_record`, or `reviewed_zero`. Paths resolve relative to the private input JSON. Obtain the expected hash after reviewing the actual file:

```powershell
Get-FileHash -LiteralPath .openai/local/publisher-report.csv -Algorithm SHA256
```

Store its lowercase SHA-256 in the entry. The CLI checks the actual bytes against that expected hash and fails if the file changed. File paths and contents are omitted from output; proof ID/kind/hash/byte length remain for audit. A hash pins reviewed bytes, **not their truth or provider authenticity**. `reviewed:true` is an operator statement that scope, attribution, net treatment, completeness and denominator were checked; it is not an automated verification claim.

## Run and interpret

```powershell
npm run report:contribution -- --input .openai/local/reviewed-contribution.json
```

No provider keys or network requests are used. The input limit is 5MiB, with at most 100 evidence files of 20MiB each and 10,000 cohort rows. The output contains private business amounts; save/share it accordingly. Cohort rows/windows may overlap: there is deliberately no grand total across rows.

Complete, mature, reviewed, single-currency final cohort measurements produce `windowContributionMicros`. A positive, complete, reviewed unique acquired-player denominator also produces the exact rational `netContributionPerNewPlayer` (numerator in micros/denominator in players). No floating-point rounding is hidden in that ratio.

If all money is covered but proceeds are estimated or totals are allocated, only `estimatedWindowContributionMicros` and a labelled estimate ratio are returned. Install/consenting-account denominators never become unique players. Unknown/partial components, mixed currencies, immature windows or unreviewed inputs keep complete contribution null. Known subtotals remain explicitly partial. A missing denominator prevents the per-player result even when total window contribution is known. Zero denominators never cause division by zero.

This is observed D7/D30 contribution, not projected lifetime value. Fixed development investment and overhead still need recovery before claiming overall profit; `overallProfit` is always null. Compare financial observations with retention, manual return play, fairness, stability, purchase trust and content sustainability. No price/experiment winner follows from the calculator alone.

Eight focused tests cover exact positive/negative/large monetary arithmetic, all missing components, reviewed zeros, currency separation, D7/D30 maturity, estimates/attribution/denominators, payload/proof validation and the actual CLI's file hashing/path redaction/change rejection. Files and amounts are fixtures. Live publisher/settlement reconciliation and acquisition/cost evidence remain external activation/data prerequisites.

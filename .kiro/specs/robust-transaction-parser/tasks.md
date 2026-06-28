# Implementation Plan: Robust Transaction Parser

## Overview

This plan converts the staged, confidence-aware parser design into incremental coding steps. The work proceeds bottom-up: first the pure config data in `keywords.js`, then each of the four pipeline stages inside `parserService.js` (verb-locate → amount-select → merchant → flags), then the `parseAlert` orchestrator that wires them together and emits the `trace`, and finally the downstream `transactionService.js` and `metricsService.js` adjustments. A real bank SMS fixtures corpus and property-based tests for all 10 correctness properties are built alongside the code they validate.

The codebase is CommonJS Node.js with no existing test framework, so the first task wires up the test runner (`node:test`) and a property-based testing library (`fast-check`). Each task references the specific acceptance criteria it satisfies.

## Tasks

- [ ] 1. Set up test infrastructure and bank SMS fixtures
  - [ ] 1.1 Add test tooling and scripts
    - Add `fast-check` as a devDependency and add a `test` script to `package.json` that runs the Node built-in test runner (`node --test`)
    - Create a `test/` directory and a placeholder `test/_smoke.test.js` that asserts the runner works
    - _Requirements: supports all property tests_

  - [ ] 1.2 Build the real bank SMS fixtures corpus
    - Create `test/fixtures/bankSms.js` exporting an array of real-world HDFC/ICICI/SBI alert formats, each annotated with the expected `amount`, `currencySymbol`, `direction`, `merchant`, `category`, `autoTagged`, and `needsReview`
    - Include the design's documented cases: debit with `Avl Bal` balance noise, "spent on ... credit card", "txn of INR ...", salary/payroll credit, multi-word merchant ("Swiggy Instamart"), and Indian/Western comma grouping
    - _Requirements: 1.2, 2.2, 5.1, 7.2 (test corpus per design Testing Strategy)_

- [ ] 2. Add parser config data structures in `src/config/keywords.js`
  - [ ] 2.1 Add weighted verb table, guards, margin, and multi-word merchants
    - Add and export `DIRECTION_VERBS` (verb/direction/weight table), `DIRECTION_GUARDS` (`{ credit: [...], debit: [...] }`), and `DIRECTION_AMBIGUITY_MARGIN = 3`
    - Extend `MERCHANT_KEYWORDS` with multi-word entries (`Swiggy Instamart` → FOOD, `UberEats` → FOOD) ahead of their shorter prefixes, retaining all existing entries
    - Keep this file pure data only (no logic), exported alongside existing config
    - _Requirements: 4.1, 5.3, 6.2, 6.5, 7.4_

  - [ ]* 2.2 Write unit tests for config integrity
    - Assert every `DIRECTION_VERBS` entry has a valid `direction` and positive `weight`, every guard list is an array, and multi-word merchant keywords are present
    - _Requirements: 4.1, 5.3, 7.4_

- [ ] 3. Implement Stage 1 — Amount Extraction in `src/services/parserService.js`
  - [ ] 3.1 Implement `findAmountCandidates(text)`
    - Use a global currency regex to find every match; capture each candidate's `raw` substring, char `index`, normalized `symbol` (`Rs`/`INR`/`₹`), and `value` (commas stripped, optional 2-decimal paise, no-space form like `Rs.1200`)
    - Return `[]` when no currency amount is present; never throw
    - _Requirements: 1.1, 1.7, 2.1, 2.2, 2.4, 3.1, 3.2_

  - [ ] 3.2 Implement `selectAmount(candidates, verbIndex)`
    - Select the candidate with smallest absolute offset distance to `verbIndex`; on a distance tie pick the greatest value (confidence `low`); single candidate → `high`; unique nearest winner → `high`; no verb with multiple candidates → greatest value (`low`); no candidates → `amount=null`, confidence `none`, symbol `null`
    - Set `amountMeta.candidateCount`, `selectedIndex`, `currencySymbol`; enforce confidence `none` iff amount is `null`; never throw on non-finite parse (return null)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.5, 3.3, 3.4_

  - [ ]* 3.3 Write property test for comma invariance
    - **Property 2: Comma invariance**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [ ]* 3.4 Write property test for currency metadata separation
    - **Property 9: Currency metadata never corrupts the amount**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [ ] 4. Implement Stage 2 — Direction Detection in `src/services/parserService.js`
  - [ ] 4.1 Implement `isGuarded(text, entry)`
    - Look ahead from the verb hit for a configured guard word in `DIRECTION_GUARDS[entry.direction]`, matched case-insensitively as the token directly following the verb, with non-alphanumeric/string-edge neighbors
    - _Requirements: 5.1, 5.3, 5.4_

  - [ ] 4.2 Implement `detectDirection(text)`
    - Scan `DIRECTION_VERBS`, discard guarded hits (recording suppressed verb token, offset, and guard word in `directionMeta.guardedOut`), sum surviving weights into `creditWeight`/`debitWeight` (each seeded at 0)
    - Return `unknown`/`none` when no verb survives; margin `> 3` → higher polarity, `high`; margin `> 0` and `≤ 3` → higher polarity, `low`; tie (diff 0) → `debit`, `low`; provide `verbIndex` as the winning polarity's highest-weight surviving verb (lowest offset on weight tie) or `null`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 5.2, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 4.3 Write property test for guard suppression
    - **Property 3: Guarded verbs never vote**
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 4.4 Write property test for direction honesty
    - **Property 4: Direction honesty**
    - **Validates: Requirements 4.2, 6.1, 6.2, 6.3**

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Stage 3 — Merchant Auto-Tagging in `src/services/parserService.js`
  - [ ] 6.1 Implement `boundaryIncludes(haystackLower, needleLower)`
    - Case-insensitive `indexOf` search requiring non-alphanumeric or string-edge neighbors on both sides; handles multi-word keywords
    - _Requirements: 7.1_

  - [ ] 6.2 Implement `detectMerchant(text)`
    - Collect all boundary-safe matches across `MERCHANT_KEYWORDS`; return the greatest-length keyword (lowest offset on length tie), order-independent; populate `merchantMeta.matched`/`matchLength`/`category`; return `null` with `matched=false` when none match
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 6.3 Write property test for longest-match-wins
    - **Property 5: Longest-match-wins**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [ ] 7. Implement Stage 4 — Flags in `src/services/parserService.js`
  - [ ] 7.1 Implement `computeNeedsReview` and honest `autoTagged`
    - Set `autoTagged = merchantMeta.matched` (true iff a real keyword matched; MISC fallback → false)
    - Compute `needsReview = true` when `amount===null` OR amount confidence `low` OR direction `unknown` OR direction confidence `low`; merchant absence alone does NOT force it; always set exactly one boolean
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 7.2 Write property test for autoTagged honesty
    - **Property 6: autoTagged honesty**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [ ]* 7.3 Write property test for needsReview completeness
    - **Property 7: needsReview completeness**
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [ ] 8. Implement the `parseAlert` orchestrator in `src/services/parserService.js`
  - [ ] 8.1 Wire stages together and assemble ParsedTransaction with trace
    - Run direction's verb-locator first, feed `verbIndex` to amount selection, then merchant, then flags; assemble the full `ParsedTransaction` (values + `amountMeta`/`directionMeta`/`merchantMeta` + `trace`)
    - Stop throwing on null amount (return flagged record); keep the only legitimate throw for non-string/empty-after-trim input with message `rawMessage must be a non-empty string`; populate `trace` (amount substring, post-guard verbs as a list, winning keyword; null/empty when absent); preserve existing reward/`expectedSavings` and `description` behavior
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 8.2 Write property test for total-function behavior
    - **Property 8: Total function**
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [ ]* 8.3 Write property test for balance-not-selected
    - **Property 1: Balance is never selected as the amount**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

  - [ ]* 8.4 Write fixtures-corpus integration tests for `parseAlert`
    - Run every fixture from `test/fixtures/bankSms.js` through `parseAlert` and assert the annotated expected outputs, including the `trace` fields
    - _Requirements: 10.1, 10.2, 12.1, 12.2, 12.3_

- [ ] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Update `src/services/transactionService.js`
  - [ ] 10.1 Remove unparseable try/catch and clear needsReview on recategorize
    - Remove the "unparseable" try/catch in `ingestAlert`/`seed` (parser no longer throws on missing amount); in `recategorize`, set `needsReview: false` on the stored update and retain it without recomputation
    - _Requirements: 9.5, 10.1, 10.2_

  - [ ]* 10.2 Write unit tests for transactionService changes
    - Assert ingest of an amount-less alert persists a flagged record (no throw) and that recategorize sets `needsReview=false`
    - _Requirements: 9.5, 10.2_

- [ ] 11. Update `src/services/metricsService.js`
  - [ ] 11.1 Exclude unknown direction and expose needsReviewCount
    - Add credit amount (absolute) to income, debit to spend, skip `unknown` from both totals, skip `null`-amount transactions; add `needsReviewCount` to `totals` equal to the count of `needsReview===true` records
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 11.2 Write property test for metrics excluding unknown direction
    - **Property 10: Metrics exclude unknown direction**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific acceptance criteria for traceability.
- All four pipeline stages live in `src/services/parserService.js`, so their implementation tasks are sequenced across separate waves to avoid edit conflicts on that file.
- Property tests use `fast-check` over the Node built-in test runner and are placed close to the code they validate.
- The bank SMS fixtures corpus uses real alert formats per the design's Testing Strategy; synthetic strings that echo the regex are avoided.
- `needsReview` rate is the headline production quality proxy; the trace field makes any misparse debuggable from one log line.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.1"] },
    { "id": 4, "tasks": ["4.2"] },
    { "id": 5, "tasks": ["4.3", "4.4", "6.1"] },
    { "id": 6, "tasks": ["6.2"] },
    { "id": 7, "tasks": ["6.3", "7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "8.4", "10.1", "11.1"] },
    { "id": 10, "tasks": ["10.2", "11.2"] }
  ]
}
```

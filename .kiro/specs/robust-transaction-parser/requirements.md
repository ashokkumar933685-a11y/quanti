# Requirements Document

## Introduction

This feature reworks the transaction SMS parser (`parserService.js`) from a "first-match-wins, always-tag" parser into a staged, confidence-aware pipeline whose guiding philosophy is **zero silent failures**. Every parsing stage emits both a value AND a confidence/flag, so each output is either correct or explicitly marked uncertain — never confidently wrong. The pipeline runs in four stages (Amount → Direction → Merchant → Flags), preserves the existing layered architecture (config holds data, services hold logic), and adds confidence metadata, currency metadata, a three-state direction, an honest `autoTagged` flag, and an aggregate `needsReview` signal that serves as an ongoing production quality proxy.

These requirements are derived from the approved design document and are written so the design's correctness properties (Properties 1–8) map onto specific acceptance criteria.

This document also extends the parser to accept arbitrary free-form SMS text pasted into a demo input box — which may be a genuine bank alert, a promotional message, or a fraudulent/spam/phishing message. For all such inputs the parser still extracts the amount, decides direction, and categorizes as before, and additionally runs a Stage 5 Suspicion_Detector that flags the message as suspicious based on configurable fraud-indicator signals. The suspicion flag is additive: it never rejects or blocks a transaction; instead a suspicious transaction is still parsed and added, carries suspicion metadata, and escalates `needsReview` to `true` so it surfaces for review (see Requirements 13–15).

### Open Decisions — Resolved

The design listed three Open Decisions for the requirements phase. They are resolved here and reflected in the acceptance criteria below:

1. **Merchant absence and `needsReview`:** Absence of a merchant match SHALL NOT, by itself, force `needsReview=true`. Income alerts legitimately carry no corporate merchant. `needsReview` is driven by amount and direction uncertainty only (see Requirement 9).
2. **Weak-only direction resolution:** A direction supported only by a weak generic verb (e.g. `txn of`, weight 1) SHALL resolve to `debit` with `low` confidence (and therefore `needsReview=true`), rather than to `unknown`. This keeps a usable default for a spend tracker while still flagging the record (see Requirement 6).
3. **`unknown` direction in metrics:** The Metrics_Service SHALL exclude `unknown`-direction transactions from BOTH income and spend totals, rather than holding them in a separate bucket, to keep scope minimal (see Requirement 11).

## Glossary

- **Parser**: The `parseAlert` orchestrator in `parserService.js` that runs the four-stage pipeline and assembles a ParsedTransaction.
- **Amount_Extractor**: The Stage 1 component that finds all currency-amount candidates and selects one.
- **Direction_Detector**: The Stage 2 component that determines transaction polarity using a weighted verb table and negative guards.
- **Merchant_Tagger**: The Stage 3 component that performs boundary-safe, longest-match-wins merchant keyword detection.
- **Flag_Aggregator**: The Stage 4 component that computes `autoTagged` and `needsReview`.
- **Metrics_Service**: The `computeMetrics` reducer in `metricsService.js` that aggregates totals across transactions.
- **Transaction_Service**: The `transactionService.js` module that ingests alerts and recategorizes transactions.
- **ParsedTransaction**: The structured output record (values plus per-stage confidence metadata and a debug trace).
- **Currency amount**: A text occurrence matching a currency form such as `Rs.`, `INR`, or `₹` followed by digits.
- **Transaction amount**: The currency amount representing the value of the transaction, sitting adjacent to a directional verb.
- **Balance amount**: A currency amount representing a running account balance (e.g. adjacent to "Avl Bal").
- **Directional verb**: A token in the weighted verb table indicating credit or debit polarity.
- **Negative guard**: A guard word that, when it immediately follows a directional verb, suppresses that verb hit (e.g. "credit card").
- **Ambiguity margin**: The threshold `DIRECTION_AMBIGUITY_MARGIN` (value 3) at or below which the credit/debit weight difference is too close to trust.
- **Confidence**: A per-stage label of `high`, `low`, or `none`.
- **autoTagged**: A flag that is true only when a real merchant keyword match occurred.
- **needsReview**: An aggregate flag that is true when any tracked stage reports uncertainty.
- **Suspicion_Detector**: The Stage 5 component that scans the raw alert text for configured fraud-indicator signals and produces a suspicion verdict plus metadata, without altering or blocking the amount, direction, merchant, or flag stages.
- **Fraud-indicator signal**: A named, configurable category of fraud cue (for example `LINK`, `SHORTENED_LINK`, `CREDENTIAL_REQUEST`, `URGENCY_THREAT`, or `REWARD_BAIT`), defined as data in configuration with one or more associated text patterns.
- **Signal pattern**: A single configured pattern (keyword or regular expression) belonging to a fraud-indicator signal; a signal fires when at least one of its patterns matches the alert text.
- **suspicious**: A boolean flag on a ParsedTransaction that is true when one or more fraud-indicator signals fire for the alert text.
- **SuspicionMeta**: The metadata recording the fraud-indicator signals that fired for an alert, each with the signal id and the verbatim matched substring(s).
- **Free-form alert**: Any raw text a user submits to the Parser, which may be a genuine bank alert, a promotional message, or a fraudulent/spam/phishing message.

## Requirements

### Requirement 1: Amount candidate selection (balance vs transaction disambiguation)

**User Story:** As a user tracking spend, I want the parser to pick the transaction amount and not the running balance, so that my totals reflect what I actually spent or received.

#### Acceptance Criteria

1. THE Amount_Extractor SHALL find every currency amount in the alert and record each candidate's starting character offset and currency symbol.
2. WHEN an alert contains more than one currency amount and a directional verb is located, THE Amount_Extractor SHALL select the candidate whose absolute character-offset distance from the highest-weight surviving directional verb is the smallest.
3. WHEN an alert contains exactly one currency amount, THE Amount_Extractor SHALL select that candidate and set amount confidence to `high`.
4. WHEN an alert contains more than one currency amount and exactly one candidate has the smallest absolute character-offset distance from the highest-weight surviving directional verb, THE Amount_Extractor SHALL set amount confidence to `high`.
5. IF an alert contains more than one currency amount and two or more candidates share the smallest absolute character-offset distance from the highest-weight surviving directional verb, THEN THE Amount_Extractor SHALL select the candidate with the greatest numeric value among those tied candidates and set amount confidence to `low`.
6. IF an alert contains more than one currency amount and no directional verb is located, THEN THE Amount_Extractor SHALL select the candidate with the greatest numeric value and set amount confidence to `low`.
7. THE Amount_Extractor SHALL set `amountMeta.candidateCount` equal to the number of currency amounts found.

### Requirement 2: Comma invariance and numeric normalization

**User Story:** As a user, I want amounts parsed correctly regardless of digit grouping, so that "Rs.1,20,000" and "Rs.1,200,000" are read as exact numbers.

#### Acceptance Criteria

1. THE Amount_Extractor SHALL remove every comma character from the matched amount substring before converting it to a number.
2. THE Amount_Extractor SHALL produce a parsed numeric amount that contains no comma and equals the exact integer value of the matched digit sequence for both Indian grouping (for example `1,20,000` equals 120000) and Western grouping (for example `1,200,000` equals 1200000).
3. WHERE a matched amount includes a fractional part of one or two digits (for example `.5` or `.50`), THE Amount_Extractor SHALL preserve that fractional part in the parsed number with a precision of exactly two decimal places (for example `99.50` equals 99.50).
4. WHERE a matched amount has zero space characters between the currency symbol and the first digit (for example `Rs.1200`), THE Amount_Extractor SHALL produce a parsed numeric amount that equals the value of the matched digits, identical to the value produced when one or more space characters separate the symbol and digits.
5. IF the matched digit sequence cannot be converted to a finite number after commas are removed, THEN THE Amount_Extractor SHALL set amount to `null` and amount confidence to `none` and SHALL NOT throw.

### Requirement 3: Currency metadata separation and null-amount handling

**User Story:** As a developer consuming ParsedTransaction, I want the currency symbol kept separate from the numeric amount and a defined behavior when no amount exists, so that downstream math is never corrupted by symbols or missing values.

#### Acceptance Criteria

1. THE Amount_Extractor SHALL record the selected amount's currency symbol as separate metadata, and SHALL store the numeric amount as digits plus an optional decimal fraction only, with no currency characters glued to it.
2. WHEN a currency amount is selected, THE Amount_Extractor SHALL set the currency metadata to the prefixing symbol normalized to exactly one of `Rs`, `INR`, or `₹`.
3. IF no currency amount is present in the alert, THEN THE Amount_Extractor SHALL set amount to `null`, amount confidence to `none`, and currency metadata to `null`.
4. THE Amount_Extractor SHALL set amount confidence to `none` if and only if the amount is `null`.

### Requirement 4: Weighted-verb direction scoring

**User Story:** As a user, I want direction decided by the strongest evidence in the alert, so that strong verbs like "debited" outweigh weak generic phrases.

#### Acceptance Criteria

1. THE Direction_Detector SHALL sum the weights of all surviving verb hits per polarity into `creditWeight` and `debitWeight`, with each weight initialized to 0 so that a polarity having no surviving verb hit holds a summed weight of exactly 0.
2. WHEN surviving verbs exist for both polarities and the two summed weights differ, THE Direction_Detector SHALL return the polarity whose summed weight is strictly greater.
3. IF surviving verbs exist for both polarities and `creditWeight` equals `debitWeight`, THEN THE Direction_Detector SHALL return `debit`.
4. WHEN a winning polarity is determined, THE Direction_Detector SHALL provide to the Amount_Extractor the character offset of that polarity's highest-weight surviving verb, selecting the surviving verb with the smallest character offset when two or more surviving verbs in the winning polarity share that highest weight.
5. IF no directional verb survives, THEN THE Direction_Detector SHALL provide a character offset of `null` to the Amount_Extractor.

### Requirement 5: Negative guard suppression

**User Story:** As a user, I want phrases like "credit card" or "debit limit" to not flip my transaction direction, so that a spend on a credit card is not misread as income.

#### Acceptance Criteria

1. WHEN a directional verb hit is immediately followed by one of its configured guard words — meaning the guard word is the token directly after the verb with no intervening token — THE Direction_Detector SHALL discard that verb hit so it contributes zero weight to both `creditWeight` and `debitWeight`.
2. WHEN a verb hit is suppressed by a guard, THE Direction_Detector SHALL append an entry to `directionMeta.guardedOut` recording the suppressed verb token, that token's character offset in the alert, and the guard word that triggered the suppression.
3. THE Direction_Detector SHALL read the guard-word list associated with each directional verb from configuration data, so new collisions can be added without code changes.
4. THE Direction_Detector SHALL match a guard word case-insensitively and only when the characters immediately before and after the guard word are non-alphanumeric or a string edge.
5. IF every surviving directional verb for a polarity is suppressed by a guard, THEN THE Direction_Detector SHALL treat that polarity's summed weight as zero.

### Requirement 6: Three-state direction and ambiguity margin

**User Story:** As a user, I want the parser to admit when it cannot tell the direction, so that an uncertain read is flagged rather than presented as a confident expense.

#### Acceptance Criteria

1. IF no surviving directional verb exists, THEN THE Direction_Detector SHALL set direction to `unknown` and direction confidence to `none`.
2. WHEN the absolute difference between `creditWeight` and `debitWeight` is greater than the ambiguity margin (value 3), THE Direction_Detector SHALL select the higher-weight polarity as the direction and set direction confidence to `high`.
3. WHILE the absolute difference between `creditWeight` and `debitWeight` is greater than 0 and at or below the ambiguity margin (value 3), THE Direction_Detector SHALL select the higher-weight polarity as the direction and set direction confidence to `low`.
4. IF surviving verbs exist and the absolute difference between `creditWeight` and `debitWeight` is 0, THEN THE Direction_Detector SHALL select `debit` as the direction and set direction confidence to `low`.
5. WHEN the only surviving direction evidence is a single directional verb of weight 1 (for example `txn of`), THE Direction_Detector SHALL resolve direction to `debit` with `low` confidence.

### Requirement 7: Boundary-safe, longest-match-wins merchant tagging

**User Story:** As a user, I want merchants matched precisely, so that "UberEats" is tagged as food and "ola" is not matched inside an unrelated word.

#### Acceptance Criteria

1. THE Merchant_Tagger SHALL match a merchant keyword case-insensitively, and SHALL treat the keyword as matched only when the character immediately before the match and the character immediately after the match are each either a non-alphanumeric character (any character that is not a letter A–Z/a–z or a digit 0–9) or a string edge (the start or end of the alert text).
2. WHEN two or more boundary-safe merchant keywords match, THE Merchant_Tagger SHALL return the keyword with the greatest character length.
3. WHEN two or more boundary-safe matched keywords share the same greatest character length, THE Merchant_Tagger SHALL return the keyword whose match begins at the lowest character offset.
4. THE Merchant_Tagger SHALL return the longest boundary-safe match independent of the order of keywords in the configuration array.
5. WHEN the Merchant_Tagger returns a boundary-safe match, THE Merchant_Tagger SHALL set `merchantMeta.matched` to `true`.
6. IF no boundary-safe merchant keyword occurs, THEN THE Merchant_Tagger SHALL return `null` and SHALL set `merchantMeta.matched` to `false`.

### Requirement 8: Honest autoTagged flag

**User Story:** As a user, I want the "Auto" badge to mean a real merchant was recognized, so that a MISC fallback is not disguised as a confident auto-tag.

#### Acceptance Criteria

1. WHEN the Merchant_Tagger returns a non-null merchant keyword for the alert, THE Flag_Aggregator SHALL set `merchantMeta.matched` to `true`.
2. IF the Merchant_Tagger returns `null` (no boundary-safe merchant keyword matched) and the category falls back to MISC, THEN THE Flag_Aggregator SHALL set `merchantMeta.matched` to `false`.
3. WHEN `merchantMeta.matched` is `true`, THE Flag_Aggregator SHALL set `autoTagged` to `true`.
4. IF `merchantMeta.matched` is `false`, THEN THE Flag_Aggregator SHALL set `autoTagged` to `false`.
5. THE Flag_Aggregator SHALL set `autoTagged` to `true` if and only if `merchantMeta.matched` is `true`.

### Requirement 9: needsReview aggregation

**User Story:** As an operator, I want every uncertain parse flagged, so that the `needsReview` rate is a trustworthy production quality proxy.

#### Acceptance Criteria

1. IF the amount is `null` or amount confidence is `low`, THEN THE Flag_Aggregator SHALL set `needsReview` to `true`.
2. IF direction is `unknown` or direction confidence is `low`, THEN THE Flag_Aggregator SHALL set `needsReview` to `true`.
3. WHEN amount confidence is `high` and direction confidence is `high`, THE Flag_Aggregator SHALL set `needsReview` to `false` regardless of whether `merchantMeta.matched` is `true` or `false`, UNLESS the transaction is flagged suspicious (see Requirement 14).
4. WHEN the Flag_Aggregator finalizes a ParsedTransaction, THE Flag_Aggregator SHALL set `needsReview` to exactly one boolean value, either `true` or `false`, and SHALL NOT leave it unset.
5. WHEN a human selects a category through recategorization, THE Transaction_Service SHALL set `needsReview` to `false` and SHALL retain that value without recomputing it from amount confidence or direction confidence.

### Requirement 10: Total-function parsing behavior

**User Story:** As a developer, I want the parser to never throw on a missing amount, so that no transaction record is silently lost.

#### Acceptance Criteria

1. WHEN a string that is non-empty after trimming surrounding whitespace is provided, THE Parser SHALL return a ParsedTransaction and SHALL NOT throw.
2. WHEN a non-empty (after trimming) input string contains no detectable transaction amount, THE Parser SHALL return a ParsedTransaction with `amount` set to `null` and amount confidence set to `none`, and SHALL NOT throw.
3. IF the input is not of string type (including `null` and `undefined`), THEN THE Parser SHALL throw an error whose message is `rawMessage must be a non-empty string`, and SHALL NOT return a ParsedTransaction.
4. IF the input is a string that is empty or contains only whitespace after trimming, THEN THE Parser SHALL throw an error whose message is `rawMessage must be a non-empty string`, and SHALL NOT return a ParsedTransaction.

### Requirement 11: Metrics handling of unknown direction

**User Story:** As a user reviewing my dashboard, I want unclassified transactions left out of income and spend, so that an unknown-direction parse does not inflate my expenses.

#### Acceptance Criteria

1. WHEN a transaction has direction `credit` and a non-null amount, THE Metrics_Service SHALL add the absolute (non-negative) value of its amount to total income.
2. WHEN a transaction has direction `debit` and a non-null amount, THE Metrics_Service SHALL add the absolute (non-negative) value of its amount to total spend.
3. WHEN a transaction has direction `unknown`, THE Metrics_Service SHALL exclude its amount from both total income and total spend, contributing zero to each.
4. IF a transaction has a `null` amount, THEN THE Metrics_Service SHALL exclude that transaction from both total income and total spend regardless of its direction, contributing zero to each.
5. THE Metrics_Service SHALL expose a `needsReviewCount` in the totals equal to the count of transactions whose `needsReview` is `true`, where a collection with zero such transactions yields a `needsReviewCount` of 0.

### Requirement 12: Observable match trace

**User Story:** As a developer debugging a wrong parse, I want each result to carry a trace of what matched, so that a misread is diagnosable from one log line.

#### Acceptance Criteria

1. WHEN the Amount_Extractor selects an amount, THE Parser SHALL record in the trace the matched amount substring preserved verbatim as it appeared in the alert text.
2. WHEN one or more surviving (post-guard) directional verbs fire, THE Parser SHALL record them in the trace.
3. WHEN the Merchant_Tagger returns a winning keyword, THE Parser SHALL record that keyword in the trace.
4. IF no amount is selected or no merchant keyword wins, THEN THE Parser SHALL record the corresponding scalar trace field (amount substring, merchant keyword) as `null`.
5. IF no directional verb survives, THEN THE Parser SHALL record the directional-verb trace field as an empty list.

### Requirement 13: Heuristic suspicion detection from configurable fraud-indicator signals

**User Story:** As a user who pastes arbitrary SMS text into the demo input box, I want the parser to flag messages that look like fraud, spam, or phishing, so that a deceptive message is surfaced as suspicious even while it is still parsed.

#### Acceptance Criteria

1. THE Suspicion_Detector SHALL read the set of fraud-indicator signals, and each signal's associated patterns, from configuration data, so that signals and patterns can be added or tuned without code changes.
2. WHEN at least one configured pattern of a fraud-indicator signal matches the alert text, THE Suspicion_Detector SHALL record that signal as fired.
3. THE Suspicion_Detector SHALL match every signal pattern case-insensitively.
4. WHEN the alert text contains a URL beginning with `http://`, `https://`, or `www.`, THE Suspicion_Detector SHALL record the `LINK` signal as fired.
5. WHEN the alert text contains a configured shortened-link host (for example `bit.ly`, `tinyurl.com`, or `t.co`), THE Suspicion_Detector SHALL record the `SHORTENED_LINK` signal as fired.
6. WHEN the alert text contains a configured credential-request term (for example `OTP`, `PIN`, `CVV`, or `password`), THE Suspicion_Detector SHALL record the `CREDENTIAL_REQUEST` signal as fired.
7. WHEN the alert text contains a configured urgency or account-threat phrase (for example `account blocked`, `KYC expired`, or `click here`), THE Suspicion_Detector SHALL record the `URGENCY_THREAT` signal as fired.
8. WHEN the alert text contains a configured reward, lottery, or prize-bait phrase (for example `you have won`, `lottery`, or `claim your prize`), THE Suspicion_Detector SHALL record the `REWARD_BAIT` signal as fired.
9. WHEN no configured signal pattern matches the alert text, THE Suspicion_Detector SHALL record zero fired signals.

### Requirement 14: Additive suspicion flag and needsReview escalation

**User Story:** As a user, I want a suspicious message to still be parsed and added to my feed while being clearly marked for review, so that I keep a record of it and notice the risk rather than losing it.

#### Acceptance Criteria

1. WHEN one or more fraud-indicator signals fire for the alert text, THE Flag_Aggregator SHALL set `suspicious` to `true`.
2. WHEN zero fraud-indicator signals fire for the alert text, THE Flag_Aggregator SHALL set `suspicious` to `false`.
3. WHEN the Flag_Aggregator finalizes a ParsedTransaction, THE Flag_Aggregator SHALL set `suspicious` to exactly one boolean value, either `true` or `false`, and SHALL NOT leave it unset.
4. WHILE a ParsedTransaction is flagged suspicious, THE Parser SHALL still produce the amount, direction, and category for that alert using the same Stage 1 through Stage 3 logic applied to non-suspicious alerts, and SHALL NOT reject, drop, or block the transaction on the basis of the suspicious flag.
5. IF `suspicious` is `true`, THEN THE Flag_Aggregator SHALL set `needsReview` to `true`.
6. THE Suspicion_Detector SHALL determine the suspicion verdict independently of amount confidence, direction confidence, and merchant match, so that a high-confidence parse can still be flagged suspicious.

### Requirement 15: Suspicion metadata and trace

**User Story:** As a developer reviewing a flagged message, I want a record of exactly which fraud-indicator signals fired and the text that triggered them, so that a suspicion verdict is auditable from one log line.

#### Acceptance Criteria

1. WHEN one or more fraud-indicator signals fire, THE Suspicion_Detector SHALL record in `suspicionMeta.signals` an entry for each fired signal containing the signal id and the verbatim matched substring.
2. THE Suspicion_Detector SHALL set `suspicionMeta.signalCount` equal to the number of distinct fraud-indicator signals that fired.
3. WHEN one or more fraud-indicator signals fire, THE Parser SHALL record the fired signal ids in the trace.
4. IF no fraud-indicator signal fires, THEN THE Suspicion_Detector SHALL set `suspicionMeta.signals` to an empty list, set `suspicionMeta.signalCount` to 0, and THE Parser SHALL record the suspicion trace field as an empty list.

# Quanti — Automated Money Manager

An automated money manager that mimics a digital banking statement page. It parses
unstructured UPI/bank transaction alerts, auto-categorizes them, and visualizes
spending habits. **All business logic — parsing, categorization, reward detection,
and metric aggregation — lives on the server.** The frontend is presentation-only.

## Features

- **Transaction Stream** — a chronological feed of transaction cards. Each card shows
  a clean description, the signed value (green credit / red debit), and an interactive
  category dropdown.
- **Visual Analytics Block** — a row of category progress blocks (Food & Dining,
  Travel, Salary, Miscellaneous) whose tracks fill as transactions flow in.
- **Automated Keyword Tagging Parser** — scans the raw alert for known merchant
  keywords (Zomato, Swiggy, Uber, …) and auto-assigns a fallback category.
- **Cumulative Metric Reducer** — isolates incoming (credit) from outbound (debit)
  values and aggregates per-category sums plus headline totals.
- **Expected Savings rule** — any outbound alert containing `Cashback` or a known
  reward partner (CRED, Amazon Pay, …) injects a green "Expected Savings" sub-metric
  showing simulated projected reward points under that card.

## Architecture

```
server.js                     # entry point: seeds data, starts the server
src/
  app.js                      # express app wiring (json, routes, static, errors)
  config/
    categories.js             # canonical category definitions
    keywords.js               # merchant keywords + reward partners + rates
  data/
    store.js                  # in-memory transaction store (swappable for a DB)
  services/
    parserService.js          # keyword tagging parser + reward detection
    metricsService.js         # cumulative metric reducer
    transactionService.js     # orchestration (ingest, recategorize, dashboard)
  controllers/
    transactionController.js  # thin HTTP layer
  routes/
    index.js                  # API routes
public/                       # presentation-only frontend
  index.html
  css/styles.css
  js/api.js                   # API client
  js/app.js                   # rendering + interactions
```

The layering (routes → controllers → services → store/config) keeps the HTTP
surface thin and all the domain logic isolated and testable.

## API

| Method | Endpoint                          | Purpose                                  |
| ------ | --------------------------------- | ---------------------------------------- |
| GET    | `/api/dashboard`                  | Transactions + aggregated metrics        |
| GET    | `/api/transactions`               | Chronological transaction feed           |
| POST   | `/api/transactions`               | Ingest a raw alert (`{ rawMessage }`)    |
| PATCH  | `/api/transactions/:id/category`  | Manual category override (`{ category }`)|
| GET    | `/api/metrics`                    | Category sums + totals                    |
| GET    | `/api/categories`                 | Selectable category tags                 |

## Running locally

```bash
npm install
npm start
# open http://localhost:3000
```

The server seeds a few realistic alerts on boot so the dashboard isn't empty.

## How the parser works

Given a raw alert such as `Paid Rs. 250 to Zomato for lunch order`:

1. **Amount** is extracted via regex (`Rs.`, `INR`, `₹`, with comma handling).
2. **Direction** is decided by the earliest directional keyword in the text
   (`Paid`/`Sent`/`Debited` → debit, `Received`/`Credited` → credit). Word-boundary
   matching prevents false positives like "credit" inside "credit card".
3. **Category** is auto-assigned from the first matched merchant keyword, else
   falls back to `Miscellaneous`.
4. **Expected Savings** is attached only to outbound transactions that mention
   `Cashback` or a known reward partner; points are simulated as a % of spend.

# Quanti — Smart Money Manager

Quanti is a mobile-style finance dashboard that turns raw UPI and bank SMS alerts
into a polished money-management experience. It parses unstructured transaction
messages, auto-categorizes them, detects suspicious activity, and presents the
results through a clean, interactive frontend.

All core business logic — parsing, categorization, reward detection, fraud heuristics,
and metric aggregation — runs on the server. The frontend is focused on presentation
and interaction.

## What the app does

- Ingests raw SMS alerts through the transaction composer and API.
- Extracts amount, direction, merchant context, and category from each alert.
- Auto-tags everyday expenses and income into Food, Travel, Salary, and Miscellaneous.
- Detects expected savings for cashback or reward-style messages.
- Flags suspicious messages that contain web links, OTP requests, KYC scare tactics,
  or urgency-based wording.
- Displays a warning banner and suspicious count on the hero card.
- Renders analytics cards with ring/bar toggles and comparison bars.
- Supports bottom navigation for Home, Analytics, History, and Profile views.
- Allows manual category overrides directly from transaction cards.

## Main features

- **Transaction stream** — a chronological list of transactions with signed amounts,
  category labels, and fraud highlights.
- **Fraud detection** — suspicious alerts are marked with a red warning badge,
  warning banner, and explanation text.
- **Analytics** — category cards show spending progress, can switch between ring and
  bar mode, and include comparative bars for quick comparisons.
- **Reward detection** — cashback and reward-related alerts surface simulated
  expected savings details.
- **Bottom sheet composer** — paste or type a bank/UPI SMS and add it instantly.
- **Server-side metrics** — balances, category totals, suspicious counts, and
  expected-points totals are all computed centrally.

## Architecture

```text
server.js                     # entry point: seeds demo data and starts the app
src/
  app.js                      # Express app wiring, middleware, and static hosting
  config/
    categories.js             # canonical categories
    keywords.js               # merchant keywords, reward partners, and fraud signals
  data/
    store.js                  # in-memory transaction store
  services/
    parserService.js          # parsing, categorization, reward detection, fraud logic
    metricsService.js         # aggregate totals and category metrics
    transactionService.js     # orchestration for ingest, re-categorize, and dashboard data
  controllers/
    transactionController.js  # API request handlers
  routes/
    index.js                  # route wiring
public/
  index.html                  # mobile-style app shell
  css/styles.css              # UI styling and interactions
  js/api.js                   # API client
  js/app.js                   # dashboard rendering and frontend behavior
```

The layering keeps HTTP logic thin while preserving a clean separation between
presentation and business rules.

## API

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| GET | `/api/dashboard` | Returns transactions and aggregated dashboard metrics |
| GET | `/api/transactions` | Returns the transaction feed |
| POST | `/api/transactions` | Ingests a raw alert (`{ rawMessage }`) |
| PATCH | `/api/transactions/:id/category` | Updates a transaction category |
| GET | `/api/metrics` | Returns totals and category-level metrics |
| GET | `/api/categories` | Returns available categories |

## Running locally

```bash
npm install
npm start
# open http://localhost:3000
```

The app seeds a few realistic sample alerts on startup so the dashboard is populated
immediately.

## How the parser works

Given a raw alert such as `Paid Rs. 250 to Zomato for lunch order`:

1. **Amount** is extracted using regex for `Rs.`, `INR`, `₹`, and comma-separated values.
2. **Direction** is inferred from the earliest directional keyword in the text.
3. **Category** is assigned from the first matched merchant keyword, otherwise it falls
   back to `Miscellaneous`.
4. **Expected Savings** is attached when the message mentions cashback or a reward partner.
5. **Fraud signals** are detected when the text contains suspicious indicators such as
   web links, OTP requests, KYC pressure, or urgency-based scare tactics.

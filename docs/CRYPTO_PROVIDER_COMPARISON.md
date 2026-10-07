# Crypto payment provider comparison

**For:** Saad (project lead), to send to the client before Milestone 2
**Date:** 3 October 2026
**Scope:** Brief section 9. USDT (TRC-20) and Bitcoin, Sri Lanka merchant with no US company, payouts to the client's own wallets, checkout plus dealer wallet top-ups.

Every claim below was checked on the provider's own docs, pricing pages and terms on 3 October 2026. "Not confirmed" means we could not find it in the provider's own material.

---

## 1. Recommendation

**Pick: NOWPayments. Runner-up: CoinPayments.**

NOWPayments is the only candidate that can send each payment straight to the client's own BTC and USDT wallets with no balance held in between. It accepts individuals as well as companies, does not list Sri Lanka as restricted, and does not ask a crypto-only merchant for KYC up front. Its fee is 1% (1.5% if the buyer pays the fee or a fixed rate is used). Its webhook scheme (HMAC-SHA512 of key-sorted JSON with an IPN secret) matches what the brief expects. Its weak points: it has no reusable deposit address, so dealer top-ups use one fixed-amount invoice per top-up. Its sandbox is officially no longer maintained, and custody is now switched on by default, so the client must switch it off.

CoinPayments is the runner-up. It has the clearest handling of underpayment and overpayment and real reusable deposit addresses for dealer top-ups. It also offers a free test coin (LTCT) and per-payment auto-forwarding to the client's wallet, for the same 1% fee. It loses on two points. Funds pass through a pooled custodial balance before they are forwarded. And the client must pass full business KYC through SumSub before the API works at all.

**Blocking before go-live, whichever provider is chosen:** none of the six providers' terms mention telecom, SIM or eSIM resale. All of them have broad "we may refuse any business" clauses. The client should get written confirmation from support that US SIM and eSIM resale to mostly US buyers is acceptable.

---

## 2. Comparison table

| Provider | USDT TRC-20 + BTC | Sri Lanka, no US company | Own-wallet payouts | Hosted page + signed webhooks | Under/over/expiry statuses | Fixed invoice / open-amount top-up | Sandbox | Processing fee | Merchant KYC | Settlement to own wallet | Telecom / SIM terms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **NOWPayments** | Pass | Pass (individuals allowed; Sri Lanka not listed) | Pass (non-custodial forwarding, but custody is the default and must be switched off) | Pass (HMAC-SHA512, sorted JSON) | Partial (`partially_paid`, `expired`; no overpaid status) | Fixed: yes. Open-amount: no | Partial (exists, officially unmaintained) | 1% (1.5% with fixed rate or buyer-pays) | None up front; on suspicion only | Per payment, automatic after confirmation | Not mentioned; broad discretion clause |
| **CoinPayments** | Pass | Pass (routed to Panama entity; Sri Lanka not banned) | Pass (auto-forward "To Address"; pooled custody in between) | Pass (HMAC-SHA256, base64) | Pass (clear partial, overpay and timeout rules) | Fixed: yes. Open-amount: yes | Pass (LTCT test coin) | 1% (new platform) | Full business KYC (SumSub) before API access | Per payment or hourly/nightly/weekly | Not mentioned; "elevated risk" catch-all; high-risk may pay more |
| **OxaPay** | Pass | Pass (US-registered businesses are banned; Sri Lanka not listed) | Pass (`auto_withdrawal`; custodial otherwise) | Pass (HMAC-SHA512 of raw body) | Partial (`underpaid`, `expired`; overpay not documented) | Fixed: yes. Open-amount: yes (static address) | Pass (`sandbox: true` flag) | 1.5% invoice, 2% static address | None ("non-KYC gateway") | Automatic withdrawal on paid | Not mentioned; must disclose business at signup |
| **Plisio** | Pass | Not confirmed (Sri Lanka not listed; no explicit approval) | Fail (custodial; no auto-withdrawal found) | Pass (HMAC-SHA1, PHP serialize) | Pass (`mismatch` = overpaid, `expired`, underpay tolerance) | Fixed: yes. Open-amount: white-label only | Fail (none) | 0.5% (USDT TRC-20 min $1.50 per invoice, unclear) | None up front; on suspicion | Manual withdrawal | No business list published; terms dated 2019 |
| **Cryptomus** | Pass | **Fail** (Sri Lanka indexed as a non-serviced country) | Partial (auto-withdraw hourly at best; custodial) | Pass (MD5 of base64 JSON + key) | Pass (`paid_over`, `wrong_amount`, `cancel`) | Fixed: yes. Open-amount: yes | Partial (test webhooks only) | 2% for new users | KYC (ID + liveness) plus project review | Hourly, 4h or 24h batch | Full terms blocked to us; C$177M FINTRAC penalty (Oct 2025) |
| **CoinGate** | **Fail** (no USDT at all since 2025) | **Fail** (Sri Lanka not a supported country; legal entities only) | Partial (custodial; weekly auto-settlement) | Partial (token echo, no HMAC) | Pass | Fixed: yes. Open-amount: yes (per-contact channels) | Pass | 1% | Full KYB (company documents) | Weekly | Not mentioned |

---

## 3. Provider notes

### NOWPayments (pick)
- **Payouts.** Custody is on by default for new accounts (since May 2026). With custody off and payout wallets added, "incoming funds will be sent directly to your connected wallet". In that mode NOWPayments never holds the client's private keys.
- **Eligibility.** The terms exclude residents or citizens of the EU, UK, US, UAE and Russia as account holders. Sri Lanka is not named. Individual and business registration are both offered. The terms put compliance with local law on the merchant, so the client should confirm Sri Lankan rules themselves.
- **Underpayment.** `partially_paid`, and their docs say not to deliver automatically. The merchant can mark it Finished by hand. There is no overpayment status or rule: not confirmed.
- **Expiry.** Standard payments expire after 7 days unpaid. With a fixed rate or buyer-pays-fee, the rate is held for 10 minutes and the payment then expires. Use fixed rate for checkout so prices hold.
- **Red flags:**
  - The sandbox is "no longer actively maintained or kept in sync with Production" (their own note).
  - The terms let them block accounts at their discretion and add mandatory KYC later.
  - Their blog says SHA-256 for webhooks, but the API docs say SHA-512. Follow the API docs.
- **Top-ups.** No reusable address ("deposit addresses are initially designed for a single use"). Use one fixed-amount invoice per dealer top-up. Their sub-account top-up API needs custody, so we skip it.

### CoinPayments (runner-up)
- Build on the new platform (v2 API); legacy accounts must re-register. A Sri Lanka business is served by PaidInSatoshi Inc. (Panama). Sri Lanka is not on either banned-country list.
- Payout modes per coin: To Balance (default), To Address (on confirmation), Hourly, Nightly or Weekly to Address. Funds are "held in a general multi-client wallet pooled with those of other users" until forwarded.
- Clear edge cases:
  - **Underpaid:** shows as Partially Paid. The merchant can set a tolerance or accept it by hand; otherwise it is auto-refunded at timeout.
  - **Overpaid:** completes, and the excess is auto-refunded to the buyer.
  - **Expiry:** 60-minute rate lock, then `timedOut` and auto-refund.
- Confirmations are published: BTC 2, USDT TRC-20 10.
- Wallets API gives permanent per-dealer addresses that accept any amount, which suits dealer top-ups. Permanent addresses carry a one-time activation fee.
- **Red flags:**
  - Business KYC is mandatory; without it the API returns 401.
  - Pooled custody, with possible pro-rata shortfall.
  - The terms say "high-risk industries may be required to pay higher fees".
  - 5.5% a year dormant-account fee after 12 months of inactivity.
  - Whether the 1% also applies to static-address deposits is not confirmed.

### OxaPay (third)
- The terms bar businesses registered in the US, Bangladesh, Hong Kong, Bolivia and sanctioned countries. A Sri Lanka merchant with no US company fits.
- `auto_withdrawal: 1` on invoices and static addresses sends funds to the client's saved address. Otherwise funds sit in the OxaPay balance.
- Static addresses accept any amount, which suits top-ups. Addresses unused for 6 months are revoked.
- **Red flags:**
  - Fees are higher (1.5% invoice, 2% plus a fixed fee for static addresses).
  - Overpayment handling and confirmation counts are not documented.
  - "Non-KYC" positioning is a reputational risk.
  - The terms allow "temporary blocking of assets" for any undisclosed use, so SIM and eSIM resale must be declared at signup.

### Plisio
- Supports USDT TRC-20 and BTC. Lowest headline fee (0.5%). No KYC up front.
- **Custodial.** Funds land in the Plisio balance. We found no auto-withdrawal setting, so the client would withdraw by hand or through the API. This fails the own-wallet must-have.
- No sandbox. Testing needs small real payments.
- The webhook signature is HMAC-SHA1 over PHP `serialize()` output, which is awkward outside PHP; their docs advise `json=true`.
- **Red flags:**
  - Terms dated 2019.
  - No prohibited-business list.
  - USDT TRC-20 fee wording implies a $1.50 minimum per invoice.

### Cryptomus
- Technically complete: static wallets, `paid_over` and `wrong_amount` statuses, and an underpayment tolerance.
- **Blocking:** search engines index Cryptomus's own AML page as listing Sri Lanka as a non-serviced country. We could not open the page ourselves because of a bot check.
- In October 2025 FINTRAC fined its operator (Xeltox Enterprises, "operating as Cryptomus") C$176,960,190, the largest penalty FINTRAC has issued. The findings were unreported suspicious transactions linked to fraud, ransomware and sanctions evasion. An appeal is pending.
- Custodial, with an AML `locked` status that can freeze funds. Not recommended.

### CoinGate
- **Blocking:**
  - No USDT at all. CoinGate dropped it in 2025 for MiCA compliance, and the live currency API returns none.
  - Sri Lanka is not on its supported-countries list.
  - Payment processing is "available only for ... legal persons".
- Custodial with weekly automatic settlement. Callbacks use an echoed token, not an HMAC signature. Not suitable.

---

## 4. Opening the NOWPayments account (client steps)

1. **Sign up** on nowpayments.io as **Business** (if the client has a Sri Lankan registered business) or **Individual**. Use a client-owned email address, not the developer's.
2. **Turn on 2FA.** It is required for payouts and wallet changes.
3. **Add payout wallets** in Settings > Payout wallets:
   - a Bitcoin address
   - a USDT address on **TRON (TRC-20)**
   - Both must be wallets the client controls (hardware wallet or a reputable self-custody wallet).
4. **Disable custodial processing** in Settings > Payments. This is the step that makes funds go straight to the client's wallets. Without it, funds sit in a NOWPayments custody balance.
5. **Restrict coins** to BTC and USDT TRC-20 only.
6. **Generate the API key and IPN secret** (Settings > Payments). The IPN secret is shown once. Send both to the developer through a password manager share, never by chat or email.
7. **Email support@nowpayments.io before launch.** Ask for written confirmation on two points:
   - (a) that resale of US SIM cards and eSIMs is an accepted business
   - (b) that most buyers paying from the US is acceptable for a non-US merchant
   - Also ask for their webhook IP list (partners@nowpayments.io) in case we firewall the endpoint.
8. **Keep KYC documents ready.** These are only requested if a payment is flagged.
   - Individual: photo ID (passport, national ID or driving licence), proof of address under 3 months old, and a selfie holding the ID and a note from support.
   - Company: certificate of incorporation, plus details of directors and beneficial owners.
9. **Optionally create a sandbox account** at account-sandbox.nowpayments.io. It has its own keys and IPN secret.

---

## 5. Integration notes (developer)

**Provider interface.** Keep NOWPayments behind the payment provider interface the brief already requires, so CoinPayments can replace it without schema changes.

### Webhook (IPN) verification
- **Header:** `x-nowpayments-sig`.
- **Algorithm:** HMAC-SHA512, key = IPN secret, hex digest.
- **Signed message:** the JSON body with keys sorted **recursively** (nested objects too), re-serialised with no spaces. Python: `json.dumps(body, separators=(',', ':'), sort_keys=True)`. In Node, sort the keys recursively, then `JSON.stringify`.
- **How to compare:** use a constant-time comparison. Treat the webhook as a trigger only: re-fetch `GET /v1/payment/{id}` before changing order state, and handle repeat deliveries idempotently (IPNs are re-sent on error).
- **Expired payments:** no callbacks are sent after a payment expires. Run a scheduled job to mark stale invoices expired.

### Creating payments
- **Checkout:** `POST /v1/invoice` with `price_amount`, `price_currency: usd`, `order_id`, `ipn_callback_url`, `success_url`, `cancel_url`, and `is_fixed_rate: true`. Redirect the buyer to the returned `invoice_url`.
- **Dealer top-ups:** the same call with the dealer's chosen amount. Credit the wallet only on `finished`.

### Status mapping

| Our state | NOWPayments status | Notes |
|---|---|---|
| pending | `waiting` | Invoice created, nothing received |
| confirming | `confirming`, `confirmed`, `sending` | Seen on chain or being forwarded; do not fulfil yet |
| paid | `finished` | Fulfil the order or credit the top-up |
| underpaid | `partially_paid` | Do not fulfil. Admin can mark Finished by hand, or the buyer is asked to pay the difference |
| overpaid | `finished` where `actually_paid` > `pay_amount` | No dedicated status. Flag it for admin; refunds are manual |
| expired | `expired` | Fixed-rate payments expire after 10 minutes, standard after 7 days |
| failed | `failed` | Show the Processing state's error copy and let the buyer retry |
| refunded | `refunded` | Admin only |

- **Repeat deposits:** a buyer can send more coins to the same address after a payment completes. That creates a new payment carrying `parent_payment_id`. Link it to the original order and flag it for admin.
- **Confirmation counts:** set per coin by NOWPayments and not published (not confirmed).

### Sandbox
- **Endpoints:** API at `https://api-sandbox.nowpayments.io`, dashboard at `https://account-sandbox.nowpayments.io`. Keys and IPN secret are separate from production.
- **Simulating outcomes:** pass `case` (for example `"success"`) when creating a payment to simulate the IPN flow. The full list of case values is not confirmed.
- **Caveat:** NOWPayments says the sandbox is no longer maintained or kept in sync with production. Plan one small real-money test per coin (BTC and USDT TRC-20) on production before launch, plus local tests that replay signed sample payloads.

### If we switch to CoinPayments
- **Signature:**
  - Headers: `X-CoinPayments-Client`, `X-CoinPayments-Timestamp`, `X-CoinPayments-Signature`.
  - Value: `Base64(HMAC-SHA256(message, clientSecret))`.
  - Message: BOM + `POST` + registered URL + client ID + timestamp + raw body.
  - Reject timestamps more than about 5 minutes off.
- **Status mapping:**
  - pending = `unpaid`
  - confirming = `pending` or `paid` (funds with CoinPayments, do not fulfil)
  - paid = `completed`
  - underpaid = Partially Paid (`partialAcceptAvailable`)
  - overpaid = `completed` (excess auto-refunded)
  - expired = `timedOut`
  - cancelled = `cancelled`
- **Testing:** LTCT test coin.

---

## 6. Sources

**NOWPayments**
- Terms of Service (FD Transfers LLC, updated 31 Aug 2026): https://nowpayments.io/doc/fd-tos.pdf?v=1.4.2
- AML/KYC policy: https://nowpayments.io/doc/fd-aml-kyc-policy.pdf?v=1.1
- API docs (statuses, IPN signature, invoice, sub-partner): https://documenter.getpostman.com/view/7907941/2s93JusNJt
- Sandbox docs and maintenance notice: https://documenter.getpostman.com/view/7907941/T1LSCRHC
- Supported coins: https://nowpayments.io/supported-coins
- Fees: https://nowpayments.io/help/about-nowpayments/about/what-are-your-fees and https://nowpayments.io/pricing
- Custody default and switching it off: https://nowpayments.io/blog/getting-started-with-custody-balances-on-nowpayments
- Non-custodial forwarding: https://nowpayments.io/help/about-nowpayments/about/where-are-my-funds-stored
- KYC: https://nowpayments.io/help/security/kyc-aml/kyc-aml-procedure
- SHA-256 mention (conflicts with API docs): https://nowpayments.io/blog/best-integration-practices-at-nowpayments

**CoinPayments**
- Instances and country routing: https://docs.coinpayments.net/instances
- Restricted countries: https://www.coinpayments.net/legal#restricted
- FAQ (new platform, EU exit): https://www.coinpayments.net/resources/faq
- User Agreement (custody, prohibited businesses, fees): https://www.coinpayments.net/next-assets/downloads/CoinPayments_User_Agreement.pdf
- Payment settings and auto-forward: https://docs.coinpayments.net/api/invoices/payment-settings
- Webhook signatures: https://docs.coinpayments.net/api/webhooks/authenticating-requests
- Invoice statuses: https://docs.coinpayments.net/api/invoices/statuses
- Payment errors (under/overpayment): https://docs.coinpayments.net/api/invoices/payment-errors
- Payment timeout: https://docs.coinpayments.net/api/invoices/payment-timeout
- Integration options and static addresses: https://docs.coinpayments.net/knowledge/integration-options and https://docs.coinpayments.net/api/wallets/address-types
- Test coin: https://docs.coinpayments.net/api/testing-currency
- Account setup and KYC: https://docs.coinpayments.net/knowledge/integration-guide/account-setup
- Fees: https://www.coinpayments.net/supported-coins and https://docs.coinpayments.net/api/fees
- Legacy IPN: https://legacy.coinpayments.net/merchant-tools-ipn

**OxaPay**
- Terms (country list, business disclosure): https://oxapay.com/terms-privacy-policy
- Pricing: https://oxapay.com/pricing
- Invoice API (auto_withdrawal, sandbox, lifetime, underpaid coverage): https://docs.oxapay.com/api-reference/payment/generate-invoice
- Static address: https://docs.oxapay.com/api-reference/payment/generate-static-address
- Statuses: https://docs.oxapay.com/api-reference/payment/payment-status-table
- Webhooks: https://docs.oxapay.com/webhook
- No KYC: https://oxapay.help/are-identification-documents-required-for-using-oxapay-kyc/

**Plisio**
- Terms: https://plisio.net/docs/plisio-terms-of-use.pdf
- AML: https://plisio.net/docs/aml.pdf
- Invoice API and callback signature: https://plisio.net/documentation/endpoints/create-an-invoice
- Statuses: https://plisio.net/documentation/endpoints/transaction-details
- Static deposit addresses: https://plisio.net/documentation/endpoints/create-a-deposit
- Fees: https://plisio.net/faq/fee-information and https://plisio.net/pricing
- KYC: https://plisio.net/faq/do-i-need-to-confirm-my-identity

**Cryptomus**
- Statuses: https://doc.cryptomus.com/merchant-api/payments/payment-statuses
- Webhook signature: https://doc.cryptomus.com/merchant-api/payments/webhook
- Static wallet: https://doc.cryptomus.com/merchant-api/payments/creating-static
- Fees: https://cryptomus.com/fees/payment
- Auto-withdrawal: https://cryptomus.com/faq/how-does-the-auto-withdrawal-feature-work
- AML page (Sri Lanka listing seen in search index only; direct fetch blocked): https://cryptomus.com/aml
- FINTRAC penalty: https://fintrac-canafe.canada.ca/new-neuf/nr/2025-10-22-eng

**CoinGate**
- USDT discontinued: https://coingate.com/blog/post/usdt-dai-discontinued
- Live currency list: https://api.coingate.com/v2/currencies
- Supported countries: https://coingate.com/supported-countries
- Payment processing terms (legal persons only, under/overpayment): https://coingate.com/policy/special-terms-and-conditions-for-crypto-assets-payment-processing
- Pricing and settlement: https://coingate.com/pricing
- Callbacks: https://developer.coingate.com/reference/payment-callback

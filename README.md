# SellAbroad Payment App

Saleor payment app for the SellAbroad Payment Container integration. Processes payments via
SellAbroad's widget (card, 3DS, BNPL, wallet) and reports fulfillment status for payout eligibility.

## What This App Does

- Installs into Saleor as a payment app.
- Exposes the Saleor payment sync webhooks:
  - `PAYMENT_GATEWAY_INITIALIZE_SESSION`
  - `TRANSACTION_INITIALIZE_SESSION`
  - `TRANSACTION_PROCESS_SESSION`
- Creates SellAbroad carts via `POST /carts/from-api`.
- Receives SellAbroad `payment.container.*` webhooks at `/api/sellabroad/webhook`.
- Reports transaction events back to Saleor via `transactionEventReport`.
- Links Saleor orders to SellAbroad orders via `POST /webhooks/payment-container/order-created`.
- Syncs fulfillment status to SellAbroad via `ORDER_UPDATED` async webhook.

## Setup

```shell
pnpm install
cp .env.example .env
pnpm generate
pnpm dev
```

Install in Dashboard with:

```text
http://localhost:9000/apps/install?manifestUrl=http://host.docker.internal:3000/api/manifest
```

## Environment Variables

See `.env.example` for the full list. Key SellAbroad variables:

- `SELLABROAD_ENABLED` — Master toggle (default: `false`)
- `SELLABROAD_API_KEY` — Your API key from SellAbroad
- `SELLABROAD_MERCHANT_ID` — Your merchant ID from SellAbroad
- `SELLABROAD_SHARED_SECRET` — HMAC shared secret for webhook verification
- `SELLABROAD_BASE_URL` — SellAbroad API base URL
- `SELLABROAD_CHECKOUT_BASE_URL` — SellAbroad checkout widget URL

## Testing

```shell
pnpm test
```

## How It Works

1. Storefront calls `paymentGatewayInitialize` — app advertises "SellAbroad" gateway
2. Storefront calls `transactionInitialize` — app creates a SellAbroad cart with `merchantSuppliedTotals`
3. Storefront receives `{ cartId, merchantId }` and mounts the SellAbroad payment widget
4. Buyer completes payment through the widget
5. SellAbroad sends `payment.container.succeeded` webhook to the app
6. App reports `CHARGE_SUCCESS` to Saleor, completes the checkout, and links the order back to SellAbroad
7. When fulfillment happens in Saleor, the app reports it to SellAbroad to unlock payouts

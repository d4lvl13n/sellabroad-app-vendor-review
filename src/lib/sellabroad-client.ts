import { SellAbroadConfig, getSellAbroadConfig } from "./config";
import { signPayload } from "./sellabroad-hmac";

export type CartCreateInput = {
  external_cart_id: string;
  external_order_id?: string;
  currency: string;
  email?: string;
  items: Array<{
    external_product_id: string;
    external_variant_id?: string;
    sku: string;
    title: string;
    variant_title?: string;
    quantity: number;
    unit_price: number;
    requires_shipping?: boolean;
  }>;
  shipping_address?: Record<string, string | undefined>;
  billing_address?: Record<string, string | undefined>;
  merchantSuppliedTotals: {
    subtotal_cents: number;
    shipping_cents: number;
    tax_cents: number;
    discount_cents: number;
    total_cents: number;
    currency: string;
  };
};

export type CartCreateResult = {
  success: boolean;
  medusa_cart: { id: string };
  source_platform: string;
  external_cart_id: string;
};

export class SellAbroadClient {
  constructor(private readonly config: SellAbroadConfig = getSellAbroadConfig()) {}

  async createCart(input: CartCreateInput): Promise<CartCreateResult> {
    const response = await fetch(`${this.config.baseUrl}/carts/from-api`, {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "x-merchant-id": this.config.merchantId,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(input),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`SellAbroad cart creation failed: ${response.status} ${text}`);
    }

    return JSON.parse(text) as CartCreateResult;
  }

  async reportOrderCreated(
    sellAbroadOrderId: string,
    externalOrderId: string,
    platform = "custom_api"
  ): Promise<{ order_id: string; external_order_id: string; status: string }> {
    const body = JSON.stringify({
      merchant_id: this.config.merchantId,
      order_id: sellAbroadOrderId,
      external_order_id: externalOrderId,
      platform,
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signPayload(body, this.config.sharedSecret);

    const response = await fetch(
      `${this.config.baseUrl}/webhooks/payment-container/order-created`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Signature": signature,
          "X-Timestamp": timestamp,
          "X-Request-Id": crypto.randomUUID(),
        },
        body,
      }
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`SellAbroad order-created report failed: ${response.status} ${text}`);
    }

    return JSON.parse(text) as { order_id: string; external_order_id: string; status: string };
  }

  async reportOrderUpdated(
    sellAbroadOrderId: string,
    status: "fulfilled" | "partially_fulfilled" | "unfulfilled" | "cancelled" | "refunded",
    trackingNumber?: string,
    carrier?: string,
    trackingUrl?: string
  ): Promise<{ order_id: string; fulfillment_status: string; payout_eligible: boolean }> {
    const body = JSON.stringify({
      merchant_id: this.config.merchantId,
      order_id: sellAbroadOrderId,
      status,
      ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
      ...(carrier ? { carrier } : {}),
      ...(trackingUrl ? { tracking_url: trackingUrl } : {}),
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signPayload(body, this.config.sharedSecret);

    const response = await fetch(
      `${this.config.baseUrl}/webhooks/payment-container/order-updated`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Signature": signature,
          "X-Timestamp": timestamp,
          "X-Request-Id": crypto.randomUUID(),
        },
        body,
      }
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`SellAbroad order-updated report failed: ${response.status} ${text}`);
    }

    return JSON.parse(text) as {
      order_id: string;
      fulfillment_status: string;
      payout_eligible: boolean;
    };
  }
}

export const createSellAbroadClient = (): SellAbroadClient => new SellAbroadClient();

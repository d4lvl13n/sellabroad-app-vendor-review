import { describe, it, expect, vi, beforeEach } from "vitest";
import { SellAbroadClient } from "../sellabroad-client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const config = {
  baseUrl: "https://oms.sellabroad.com",
  apiKey: "test-api-key",
  merchantId: "test-merchant-id",
  sharedSecret: "REDACTED_ARCHIVE_SECRET",
  checkoutBaseUrl: "https://app.sellabroad.com",
  widgetUrl: "https://app.sellabroad.com/api/widget?variant=container",
};

describe("SellAbroadClient", () => {
  let client: SellAbroadClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SellAbroadClient(config);
  });

  describe("createCart", () => {
    it("sends correct headers and returns parsed cart ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              medusa_cart: { id: "cart_abc123" },
              source_platform: "custom_api",
              external_cart_id: "saleor-tx:tx-1",
            })
          ),
      });

      const result = await client.createCart({
        external_cart_id: "saleor-tx:tx-1",
        currency: "AED",
        items: [
          {
            external_product_id: "prod-1",
            sku: "SKU-1",
            title: "Test Item",
            quantity: 1,
            unit_price: 10000,
          },
        ],
        merchantSuppliedTotals: {
          subtotal_cents: 10000,
          shipping_cents: 0,
          tax_cents: 0,
          discount_cents: 0,
          total_cents: 10000,
          currency: "AED",
        },
      });

      expect(result.medusa_cart.id).toBe("cart_abc123");

      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe("https://oms.sellabroad.com/carts/from-api");
      expect(options.headers["x-api-key"]).toBe("test-api-key");
      expect(options.headers["x-merchant-id"]).toBe("test-merchant-id");
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"message":"Invalid currency"}'),
      });

      await expect(
        client.createCart({
          external_cart_id: "tx-2",
          currency: "INVALID",
          items: [
            {
              external_product_id: "p1",
              sku: "s1",
              title: "T",
              quantity: 1,
              unit_price: 100,
            },
          ],
          merchantSuppliedTotals: {
            subtotal_cents: 100,
            shipping_cents: 0,
            tax_cents: 0,
            discount_cents: 0,
            total_cents: 100,
            currency: "INVALID",
          },
        })
      ).rejects.toThrow("SellAbroad cart creation failed: 400");
    });
  });

  describe("reportOrderCreated", () => {
    it("sends HMAC-signed body with correct payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              order_id: "sa-order-1",
              external_order_id: "saleor-42",
              status: "linked",
            })
          ),
      });

      const result = await client.reportOrderCreated("sa-order-1", "saleor-42");

      expect(result.status).toBe("linked");

      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe(
        "https://oms.sellabroad.com/webhooks/payment-container/order-created"
      );
      expect(options.headers["X-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(options.headers["X-Timestamp"]).toBeDefined();

      const body = JSON.parse(options.body);

      expect(body.merchant_id).toBe("test-merchant-id");
      expect(body.order_id).toBe("sa-order-1");
      expect(body.external_order_id).toBe("saleor-42");
    });
  });
});

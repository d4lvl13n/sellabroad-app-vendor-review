import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCartCreatePayload, toMinorUnits } from "../sellabroad-payload";

vi.mock("../config", () => ({
  getSellAbroadConfig: () => ({
    baseUrl: "https://oms.sellabroad.com",
    apiKey: "test-key",
    merchantId: "test-merchant",
    sharedSecret: "test-secret",
    checkoutBaseUrl: "https://app.sellabroad.com",
  }),
}));

describe("toMinorUnits", () => {
  it("converts dollars to cents", () => {
    expect(toMinorUnits(125.5)).toBe(12550);
  });

  it("handles zero", () => {
    expect(toMinorUnits(0)).toBe(0);
  });

  it("rounds fractional cents", () => {
    expect(toMinorUnits(10.999)).toBe(1100);
  });
});

describe("buildCartCreatePayload", () => {
  const checkout = {
    id: "checkout-1",
    email: "buyer@example.com",
    lines: [
      {
        id: "line-1",
        quantity: 2,
        variant: {
          sku: "SKU-001",
          name: "Blue / Large",
          product: { name: "T-Shirt", id: "prod-1" },
        },
        unitPrice: { gross: { amount: 25.0, currency: "USD" } },
        totalPrice: { gross: { amount: 50.0, currency: "USD" } },
      },
    ],
    totalPrice: { gross: { amount: 55.0, currency: "USD" } },
    subtotalPrice: { gross: { amount: 50.0, currency: "USD" } },
    shippingPrice: { gross: { amount: 5.0, currency: "USD" } },
    discount: { amount: 0, currency: "USD" },
    shippingAddress: {
      firstName: "Jane",
      lastName: "Doe",
      streetAddress1: "123 Main St",
      city: "Dubai",
      postalCode: "00000",
      country: { code: "AE" },
    },
    billingAddress: {
      firstName: "Jane",
      lastName: "Doe",
      streetAddress1: "123 Main St",
      city: "Dubai",
      country: { code: "AE" },
    },
  };

  it("maps checkout to SellAbroad cart payload", () => {
    const result = buildCartCreatePayload({
      saleorTransactionId: "tx-123",
      amount: 55.0,
      currency: "USD",
      checkout,
    });

    expect(result.external_cart_id).toBe("saleor-tx:tx-123");
    expect(result.currency).toBe("USD");
    expect(result.email).toBe("buyer@example.com");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sku).toBe("SKU-001");
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].unit_price).toBe(2500);
    expect(result.merchantSuppliedTotals.subtotal_cents).toBe(5000);
    expect(result.merchantSuppliedTotals.shipping_cents).toBe(500);
    expect(result.merchantSuppliedTotals.total_cents).toBe(5500);
    expect(result.merchantSuppliedTotals.currency).toBe("USD");
    expect(result.shipping_address?.country_code).toBe("AE");
  });

  it("handles missing optional fields", () => {
    const minimalCheckout = {
      id: "checkout-2",
      email: null,
      lines: [
        {
          id: "line-2",
          quantity: 1,
          variant: null,
          unitPrice: { gross: { amount: 10.0, currency: "AED" } },
          totalPrice: { gross: { amount: 10.0, currency: "AED" } },
        },
      ],
      totalPrice: { gross: { amount: 10.0, currency: "AED" } },
      subtotalPrice: null,
      shippingPrice: null,
      discount: null,
      shippingAddress: null,
      billingAddress: null,
    };

    const result = buildCartCreatePayload({
      saleorTransactionId: "tx-456",
      amount: 10.0,
      currency: "AED",
      checkout: minimalCheckout,
    });

    expect(result.email).toBeUndefined();
    expect(result.shipping_address).toBeUndefined();
    expect(result.billing_address).toBeUndefined();
    expect(result.items[0].sku).toBe("line-line-2");
    expect(result.items[0].title).toBe("Item");
    expect(result.merchantSuppliedTotals.total_cents).toBe(1000);
  });

  it("reports the pre-discount subtotal so discount never exceeds it (voucher cart)", () => {
    // Saleor's subtotalPrice is NET of the voucher: a $2 voucher on a $0.55 cart
    // leaves a $0 net subtotal but discount.amount = 0.55. Before the fix this
    // emitted discount_cents (55) > subtotal_cents (0) and the OMS rejected it.
    const voucherCheckout = {
      ...checkout,
      lines: [
        {
          id: "line-3",
          quantity: 1,
          variant: { sku: "SKU-003", name: "Small", product: { name: "Sticker", id: "prod-3" } },
          unitPrice: { gross: { amount: 0.0, currency: "USD" } },
          totalPrice: { gross: { amount: 0.0, currency: "USD" } },
        },
      ],
      totalPrice: { gross: { amount: 0.0, currency: "USD" } },
      subtotalPrice: { gross: { amount: 0.0, currency: "USD" } },
      shippingPrice: { gross: { amount: 0.0, currency: "USD" } },
      discount: { amount: 0.55, currency: "USD" },
    };

    const result = buildCartCreatePayload({
      saleorTransactionId: "tx-789",
      amount: 0.0,
      currency: "USD",
      checkout: voucherCheckout,
    });

    const totals = result.merchantSuppliedTotals;
    expect(totals.discount_cents).toBe(55);
    expect(totals.subtotal_cents).toBe(55); // net 0 + discount 55
    expect(totals.discount_cents).toBeLessThanOrEqual(totals.subtotal_cents);
    // totals stay internally consistent: subtotal - discount + shipping + tax === total
    expect(
      totals.subtotal_cents - totals.discount_cents + totals.shipping_cents + totals.tax_cents
    ).toBe(totals.total_cents);
  });
});

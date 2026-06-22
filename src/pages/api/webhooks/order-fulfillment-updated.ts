import { SaleorAsyncWebhook } from "@saleor/app-sdk/handlers/next";

import { OrderUpdatedDocument, OrderUpdatedSubscription } from "@/generated/graphql";
import { createSellAbroadClient } from "@/lib/sellabroad-client";
import { resolveTransactionIdByOrderId, getAttempt } from "@/lib/redis-store";
import { saleorApp } from "@/saleor-app";

export const orderFulfillmentUpdatedWebhook = new SaleorAsyncWebhook<
  OrderUpdatedSubscription["event"]
>({
  name: "SellAbroad Order Fulfillment Updated",
  webhookPath: "api/webhooks/order-fulfillment-updated",
  event: "ORDER_UPDATED",
  apl: saleorApp.apl,
  query: OrderUpdatedDocument,
});

type OrderUpdatedPayload = NonNullable<OrderUpdatedSubscription["event"]> & {
  order?: NonNullable<OrderUpdatedSubscription["event"]> extends { order?: infer O } ? O : never;
};

const saleorToSellAbroadStatus = (
  saleorStatus: string
): "fulfilled" | "partially_fulfilled" | "unfulfilled" | "cancelled" | "refunded" | null => {
  switch (saleorStatus) {
    case "FULFILLED":
      return "fulfilled";
    case "PARTIALLY_FULFILLED":
      return "partially_fulfilled";
    case "UNFULFILLED":
    case "UNCONFIRMED":
      return "unfulfilled";
    case "CANCELED":
      return "cancelled";
    case "RETURNED":
      return "refunded";
    default:
      return null;
  }
};

export default orderFulfillmentUpdatedWebhook.createHandler(async (req, res, ctx) => {
  const payload = ctx.payload as OrderUpdatedPayload;

  if (!("order" in payload) || !payload.order) {
    return res.status(200).json({ ok: true, skipped: "no order in payload" });
  }

  const order = payload.order;
  const privateMetadata = order.privateMetadata || [];
  const sellAbroadOrderId = privateMetadata.find(
    (m: { key: string; value: string }) => m.key === "sellabroad_order_id"
  )?.value;

  if (!sellAbroadOrderId) {
    return res.status(200).json({ ok: true, skipped: "not a SellAbroad order" });
  }

  const sellAbroadStatus = saleorToSellAbroadStatus(order.status);

  if (!sellAbroadStatus) {
    return res
      .status(200)
      .json({ ok: true, skipped: `unmapped status: ${order.status}` });
  }

  const fulfillments = order.fulfillments || [];
  const trackingNumber =
    fulfillments
      .map((f: { trackingNumber: string }) => f.trackingNumber)
      .filter(Boolean)
      .join(", ") || undefined;

  try {
    const result = await createSellAbroadClient().reportOrderUpdated(
      sellAbroadOrderId,
      sellAbroadStatus,
      trackingNumber
    );

    console.log(
      JSON.stringify({
        message: "SellAbroad fulfillment reported",
        saleorOrderId: order.id,
        sellAbroadOrderId,
        status: sellAbroadStatus,
        payoutEligible: result.payout_eligible,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "SellAbroad fulfillment report failed",
        saleorOrderId: order.id,
        sellAbroadOrderId,
        error: error instanceof Error ? error.message : "Unknown",
      })
    );
  }

  return res.status(200).json({ ok: true });
});

export const config = {
  api: {
    bodyParser: false,
  },
};

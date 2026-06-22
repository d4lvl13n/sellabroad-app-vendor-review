import { SaleorSyncWebhook } from "@saleor/app-sdk/handlers/next";

import {
  PaymentGatewayInitializeSessionDocument,
  PaymentGatewayInitializeSessionSubscription,
} from "@/generated/graphql";
import { isChannelAllowed } from "@/lib/config";
import { saleorApp } from "@/saleor-app";

export const paymentGatewayInitializeSessionWebhook =
  new SaleorSyncWebhook<PaymentGatewayInitializeSessionSubscription["event"]>({
    name: "SellAbroad Payment Gateway Initialize Session",
    webhookPath: "api/webhooks/payment-gateway-initialize-session",
    event: "PAYMENT_GATEWAY_INITIALIZE_SESSION",
    apl: saleorApp.apl,
    query: PaymentGatewayInitializeSessionDocument,
  });

type PaymentGatewayPayload = Extract<
  PaymentGatewayInitializeSessionSubscription["event"],
  { sourceObject: unknown }
>;

export default paymentGatewayInitializeSessionWebhook.createHandler((req, res, ctx) => {
  const payload = ctx.payload as PaymentGatewayPayload;
  const sourceObject = payload.sourceObject;
  const checkout = sourceObject.__typename === "Checkout" ? sourceObject : undefined;
  const channelSlug = checkout?.channel.slug;
  const currency = checkout?.channel.currencyCode;
  const enabled = isChannelAllowed(channelSlug);

  return res.status(200).json({
    data: enabled
      ? {
          name: "SellAbroad",
          type: "hosted",
        }
      : null,
  });
});

export const config = {
  api: {
    bodyParser: false,
  },
};

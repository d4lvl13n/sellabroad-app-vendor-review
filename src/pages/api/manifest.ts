import { createManifestHandler } from "@saleor/app-sdk/handlers/next";
import { AppManifest } from "@saleor/app-sdk/types";

import packageJson from "@/package.json";

import { paymentGatewayInitializeSessionWebhook } from "./webhooks/payment-gateway-initialize-session";
import { transactionInitializeSessionWebhook } from "./webhooks/transaction-initialize-session";
import { transactionProcessSessionWebhook } from "./webhooks/transaction-process-session";
import { orderFulfillmentUpdatedWebhook } from "./webhooks/order-fulfillment-updated";

export default createManifestHandler({
  async manifestFactory({ appBaseUrl, request, schemaVersion }) {
    const iframeBaseUrl = process.env.APP_IFRAME_BASE_URL || appBaseUrl;
    const apiBaseURL = process.env.APP_API_BASE_URL ?? appBaseUrl;

    const manifest: AppManifest = {
      name: "SellAbroad Payment App",
      tokenTargetUrl: `${apiBaseURL}/api/register`,
      appUrl: iframeBaseUrl,
      permissions: ["HANDLE_PAYMENTS", "MANAGE_CHECKOUTS", "MANAGE_ORDERS"],
      id: "com.infinitybiolabs.sellabroad",
      version: packageJson.version,
      webhooks: [
        paymentGatewayInitializeSessionWebhook.getWebhookManifest(apiBaseURL),
        transactionInitializeSessionWebhook.getWebhookManifest(apiBaseURL),
        transactionProcessSessionWebhook.getWebhookManifest(apiBaseURL),
        orderFulfillmentUpdatedWebhook.getWebhookManifest(apiBaseURL),
      ],
      extensions: [],
      author: "Infinity Bio Labs",
      brand: {
        logo: {
          default: `${apiBaseURL}/logo.png`,
        },
      },
    };

    return manifest;
  },
});

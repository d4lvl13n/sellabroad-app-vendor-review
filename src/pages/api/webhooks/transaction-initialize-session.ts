import { SaleorSyncWebhook } from "@saleor/app-sdk/handlers/next";

import {
  TransactionInitializeSessionDocument,
  TransactionInitializeSessionSubscription,
} from "@/generated/graphql";
import { getSellAbroadConfig, isChannelAllowed } from "@/lib/config";
import { buildCartCreatePayload } from "@/lib/sellabroad-payload";
import { AttemptRecord, saveAttempt } from "@/lib/redis-store";
import { saleorApp } from "@/saleor-app";

export const transactionInitializeSessionWebhook = new SaleorSyncWebhook<
  TransactionInitializeSessionSubscription["event"]
>({
  name: "SellAbroad Transaction Initialize Session",
  webhookPath: "api/webhooks/transaction-initialize-session",
  event: "TRANSACTION_INITIALIZE_SESSION",
  apl: saleorApp.apl,
  query: TransactionInitializeSessionDocument,
});

type TransactionInitializePayload = Extract<
  TransactionInitializeSessionSubscription["event"],
  { sourceObject: unknown; transaction: unknown; action: unknown }
>;

const failure = (message: string, pspReference?: string) => ({
  ...(pspReference ? { pspReference } : {}),
  result: "AUTHORIZATION_FAILURE",
  message,
  data: { provider: "sellabroad" },
});

export default transactionInitializeSessionWebhook.createHandler(async (req, res, ctx) => {
  const payload = ctx.payload as TransactionInitializePayload;
  const sourceObject = payload.sourceObject;
  const saleorTransactionId = payload.transaction.id;
  const fallbackPspReference = `saleor-tx:${saleorTransactionId}`;

  if (sourceObject.__typename !== "Checkout") {
    return res
      .status(200)
      .json(failure("SellAbroad supports checkout sources only.", fallbackPspReference));
  }

  const channelSlug = sourceObject.channel.slug;
  const currency = payload.action.currency;

  if (!isChannelAllowed(channelSlug)) {
    return res
      .status(200)
      .json(failure("SellAbroad is not enabled for this channel or currency.", fallbackPspReference));
  }

  const config = getSellAbroadConfig();
  const cartPayload = buildCartCreatePayload({
    saleorTransactionId,
    amount: payload.action.amount,
    currency,
    checkout: sourceObject,
  });

  const now = new Date().toISOString();
  const baseAttempt: AttemptRecord = {
    saleorTransactionId,
    checkoutId: sourceObject.id,
    saleorApiUrl: ctx.authData.saleorApiUrl,
    channelSlug,
    amount: payload.action.amount,
    currency,
    customerEmail: sourceObject.email ?? "",
    sellAbroadCartId: "",
    sellAbroadOrderId: "",
    sellAbroadMerchantId: config.merchantId,
    saleorOrderId: "",
    saleorOrderNumber: "",
    status: "created",
    createdAt: now,
    updatedAt: now,
  };

  await saveAttempt({
    ...baseAttempt,
    sellAbroadCartId: cartPayload.external_cart_id,
    status: "action_required",
    updatedAt: now,
  });

  const widgetMode = config.baseUrl.includes("staging") ? "staging" : "production";

  console.log(
    JSON.stringify({
      message: "SellAbroad widget payload prepared",
      saleorTransactionId,
      externalCartId: cartPayload.external_cart_id,
      widgetMode,
    })
  );

  return res.status(200).json({
    pspReference: fallbackPspReference,
    result: "AUTHORIZATION_ACTION_REQUIRED",
    amount: payload.action.amount,
    message: "Mount the SellAbroad payment widget to complete payment",
    actions: ["CANCEL"],
    data: {
      provider: "sellabroad",
      merchantId: config.merchantId,
      widgetUrl: config.widgetUrl,
      widgetMode,
      currency,
      fromApiPayload: cartPayload,
    },
  });
});

export const config = {
  api: {
    bodyParser: false,
  },
};

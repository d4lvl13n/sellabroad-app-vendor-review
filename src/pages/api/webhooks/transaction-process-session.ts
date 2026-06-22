import { SaleorSyncWebhook } from "@saleor/app-sdk/handlers/next";

import {
  TransactionProcessSessionDocument,
  TransactionProcessSessionSubscription,
} from "@/generated/graphql";
import { getAttempt } from "@/lib/redis-store";
import { saleorApp } from "@/saleor-app";

export const transactionProcessSessionWebhook =
  new SaleorSyncWebhook<TransactionProcessSessionSubscription["event"]>({
    name: "SellAbroad Transaction Process Session",
    webhookPath: "api/webhooks/transaction-process-session",
    event: "TRANSACTION_PROCESS_SESSION",
    apl: saleorApp.apl,
    query: TransactionProcessSessionDocument,
  });

type TransactionProcessPayload = Extract<
  TransactionProcessSessionSubscription["event"],
  { sourceObject: unknown; transaction: unknown; action: unknown }
>;

export default transactionProcessSessionWebhook.createHandler(async (req, res, ctx) => {
  const payload = ctx.payload as TransactionProcessPayload;
  const saleorTransactionId = payload.transaction.id;
  const attempt = await getAttempt(saleorTransactionId);
  const pspReference =
    attempt?.sellAbroadCartId ||
    payload.transaction.pspReference ||
    `saleor-tx:${saleorTransactionId}`;

  const resultMap: Record<string, string> = {
    succeeded: "CHARGE_SUCCESS",
    failed: "CHARGE_FAILURE",
    cancelled: "CANCEL_SUCCESS",
  };

  const result = resultMap[attempt?.status ?? ""] || "AUTHORIZATION_ACTION_REQUIRED";

  return res.status(200).json({
    pspReference,
    result,
    amount: payload.action.amount,
    message: attempt
      ? `SellAbroad payment status: ${attempt.status}`
      : "SellAbroad payment not found yet.",
    actions: ["CANCEL"],
    data: {
      cartId: attempt?.sellAbroadCartId,
      merchantId: attempt?.sellAbroadMerchantId,
    },
  });
});

export const config = {
  api: {
    bodyParser: false,
  },
};

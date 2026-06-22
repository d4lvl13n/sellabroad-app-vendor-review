import type { NextApiRequest, NextApiResponse } from "next";

import { TransactionEventTypeEnum } from "@/generated/graphql";
import { getSellAbroadConfig } from "@/lib/config";
import { verifySignature } from "@/lib/sellabroad-hmac";
import { createSellAbroadClient } from "@/lib/sellabroad-client";
import { reportTransactionEvent, completeCheckout, updateOrderPrivateMetadata } from "@/lib/saleor-graphql";
import {
  getAttempt,
  getEventStatus,
  resolveTransactionIdByCartId,
  saveAttempt,
  saveCheckoutOrderMapping,
  setEventStatus,
} from "@/lib/redis-store";
import { saleorApp } from "@/saleor-app";

type WebhookEnvelope = {
  event_id: string;
  event_name: string;
  created_at: string;
  merchant_id: string;
  data: Record<string, unknown>;
};

const FIVE_MINUTES = 300;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const config = getSellAbroadConfig();

  const rawBody =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const signature = req.headers["x-signature"] as string | undefined;
  const timestamp = req.headers["x-timestamp"] as string | undefined;

  if (!signature || !timestamp) {
    return res.status(401).json({ error: "Missing signature or timestamp" });
  }

  const skew = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));

  if (skew > FIVE_MINUTES) {
    return res.status(401).json({ error: "Timestamp out of skew" });
  }

  if (!verifySignature(rawBody, signature, config.sharedSecret)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const envelope = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as WebhookEnvelope;
  const eventId = envelope.event_id;

  const existing = await getEventStatus(eventId);

  if (existing === "processed") {
    return res.status(200).json({ ok: true, duplicate: true, eventId });
  }

  const data = envelope.data;
  const externalCartId = (data.external_cart_id as string) || "";
  const sellAbroadOrderId = (data.order_id as string) || "";

  const saleorTransactionId = externalCartId
    ? await resolveTransactionIdByCartId(externalCartId)
    : null;

  const attempt = saleorTransactionId ? await getAttempt(saleorTransactionId) : null;

  console.log(
    JSON.stringify({
      message: "SellAbroad webhook received",
      eventName: envelope.event_name,
      eventId,
      sellAbroadOrderId,
      externalCartId,
      saleorTransactionId,
      correlated: Boolean(attempt),
    })
  );

  if (!saleorTransactionId || !attempt) {
    await setEventStatus(eventId, "processed");

    return res.status(200).json({
      ok: true,
      eventId,
      warning: "Could not correlate to a Saleor transaction",
    });
  }

  const authData = await saleorApp.apl.get(attempt.saleorApiUrl);

  if (!authData) {
    console.error(
      JSON.stringify({ message: "No auth data for Saleor API URL", saleorApiUrl: attempt.saleorApiUrl })
    );
    await setEventStatus(eventId, "processed");

    return res.status(200).json({ ok: true, eventId, warning: "No Saleor auth data" });
  }

  try {
    switch (envelope.event_name) {
      case "payment.container.succeeded": {
        const amountCents = (data.amount_cents as number) || 0;
        const amount = amountCents / 100;

        const reportResult = await reportTransactionEvent(authData, {
          id: saleorTransactionId,
          type: TransactionEventTypeEnum.ChargeSuccess,
          pspReference: sellAbroadOrderId || externalCartId,
          amount,
          message: "SellAbroad payment succeeded",
        });

        const reportErrors = reportResult.transactionEventReport?.errors;
        if (reportErrors?.length) {
          console.error(JSON.stringify({
            message: "transactionEventReport returned errors",
            errors: reportErrors,
            saleorTransactionId,
          }));
        }

        const completeResult = await completeCheckout(authData, attempt.checkoutId);
        const completeErrors = completeResult.checkoutComplete?.errors;
        if (completeErrors?.length) {
          console.error(JSON.stringify({
            message: "checkoutComplete returned errors",
            errors: completeErrors,
            checkoutId: attempt.checkoutId,
          }));

          await saveCheckoutOrderMapping(attempt.checkoutId, {
            saleorOrderId: "",
            saleorOrderNumber: "",
            status: "failed",
          });

          await saveAttempt({
            ...attempt,
            status: "failed",
            sellAbroadOrderId,
            updatedAt: new Date().toISOString(),
          });
          break;
        }

        const confirmationNeeded = completeResult.checkoutComplete?.confirmationNeeded;
        if (confirmationNeeded) {
          console.log(JSON.stringify({
            message: "checkoutComplete requires confirmation (3DS)",
            checkoutId: attempt.checkoutId,
            confirmationData: completeResult.checkoutComplete?.confirmationData,
          }));

          await saveCheckoutOrderMapping(attempt.checkoutId, {
            saleorOrderId: "",
            saleorOrderNumber: "",
            status: "confirmation_needed",
          });
          break;
        }

        const saleorOrder = completeResult.checkoutComplete?.order;

        if (!saleorOrder) {
          console.error(JSON.stringify({
            message: "checkoutComplete returned no order and no errors",
            checkoutId: attempt.checkoutId,
          }));
          break;
        }

        await saveAttempt({
          ...attempt,
          status: "succeeded",
          sellAbroadOrderId,
          saleorOrderId: saleorOrder.id,
          saleorOrderNumber: saleorOrder.number,
          updatedAt: new Date().toISOString(),
        });

        await saveCheckoutOrderMapping(attempt.checkoutId, {
          saleorOrderId: saleorOrder.id,
          saleorOrderNumber: saleorOrder.number,
          status: "completed",
        });

        if (sellAbroadOrderId) {
          try {
            await updateOrderPrivateMetadata(authData, saleorOrder.id, [
              { key: "sellabroad_order_id", value: sellAbroadOrderId },
              { key: "sellabroad_cart_id", value: externalCartId },
            ]);
          } catch (metaError) {
            console.error(JSON.stringify({
              message: "Failed to write privateMetadata to order",
              saleorOrderId: saleorOrder.id,
              error: metaError instanceof Error ? metaError.message : "Unknown",
            }));
          }

          try {
            await createSellAbroadClient().reportOrderCreated(
              sellAbroadOrderId,
              saleorOrder.number || saleorOrder.id,
              "custom_api"
            );
          } catch (linkError) {
            console.error(JSON.stringify({
              message: "Failed to link order to SellAbroad",
              sellAbroadOrderId,
              saleorOrderNumber: saleorOrder.number,
              error: linkError instanceof Error ? linkError.message : "Unknown",
            }));
          }
        }

        break;
      }

      case "payment.container.failed": {
        await reportTransactionEvent(authData, {
          id: saleorTransactionId,
          type: TransactionEventTypeEnum.ChargeFailure,
          pspReference: sellAbroadOrderId || externalCartId,
          message: `SellAbroad payment failed: ${(data.reason as string) || "unknown"}`,
        });

        await saveAttempt({
          ...attempt,
          status: "failed",
          updatedAt: new Date().toISOString(),
        });

        break;
      }

      case "payment.container.refunded": {
        const refundCents = (data.refund_amount_cents as number) || 0;
        const refundAmount = refundCents / 100;

        await reportTransactionEvent(authData, {
          id: saleorTransactionId,
          type: TransactionEventTypeEnum.RefundSuccess,
          pspReference: (data.refund_id as string) || sellAbroadOrderId || externalCartId,
          amount: refundAmount,
          message: `SellAbroad refund: ${(data.reason as string) || "refund processed"}`,
        });

        await saveAttempt({
          ...attempt,
          status: "refunded",
          updatedAt: new Date().toISOString(),
        });

        break;
      }

      case "payment.container.cancelled": {
        await reportTransactionEvent(authData, {
          id: saleorTransactionId,
          type: TransactionEventTypeEnum.CancelSuccess,
          pspReference: sellAbroadOrderId || externalCartId,
          message: `SellAbroad cancellation: ${(data.reason as string) || "order cancelled"}`,
        });

        await saveAttempt({
          ...attempt,
          status: "cancelled",
          updatedAt: new Date().toISOString(),
        });

        break;
      }

      case "payment.container.chargeback_opened":
      case "payment.container.chargeback_resolved": {
        console.log(
          JSON.stringify({
            message: `SellAbroad chargeback event: ${envelope.event_name}`,
            data,
          })
        );

        break;
      }

      default:
        console.warn(JSON.stringify({ message: "Unknown SellAbroad event", eventName: envelope.event_name }));
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Error processing SellAbroad webhook",
        eventName: envelope.event_name,
        error: error instanceof Error ? error.message : "Unknown",
      })
    );

    return res.status(500).json({ error: "Internal processing error" });
  }

  await setEventStatus(eventId, "processed");

  return res.status(200).json({ ok: true, eventId });
}

export const config = {
  api: {
    bodyParser: true,
  },
};

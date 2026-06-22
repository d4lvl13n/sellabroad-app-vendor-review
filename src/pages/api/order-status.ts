import type { NextApiRequest, NextApiResponse } from "next";
import { getCheckoutOrderMapping } from "@/lib/redis-store";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const checkoutId = req.query.checkoutId;

  if (!checkoutId || typeof checkoutId !== "string") {
    return res.status(400).json({ error: "checkoutId query parameter is required" });
  }

  const mapping = await getCheckoutOrderMapping(checkoutId);

  if (!mapping) {
    return res.status(200).json({ status: "pending" });
  }

  return res.status(200).json({
    status: mapping.status,
    orderId: mapping.saleorOrderId || undefined,
    orderNumber: mapping.saleorOrderNumber || undefined,
  });
}

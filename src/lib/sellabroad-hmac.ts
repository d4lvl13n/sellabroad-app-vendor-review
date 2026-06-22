import crypto from "node:crypto";

export const signPayload = (body: string, secret: string): string => {
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");

  return `sha256=${digest}`;
};

export const verifySignature = (body: string, signature: string, secret: string): boolean => {
  const expected = signPayload(body, secret);

  if (expected.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

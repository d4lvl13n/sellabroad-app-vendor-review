import { getOptionalEnv } from "./config";

export type StoreValue =
  | string
  | number
  | boolean
  | null
  | StoreValue[]
  | { [key: string]: StoreValue };

type StoreRecord = Record<string, StoreValue>;

export type ContractStore = {
  get<T extends StoreValue>(key: string): Promise<T | null>;
  set(key: string, value: StoreValue, ttlSeconds?: number): Promise<void>;
};

class MemoryStore implements ContractStore {
  private data = new Map<string, { value: StoreValue; expiresAt?: number }>();

  async get<T extends StoreValue>(key: string): Promise<T | null> {
    const record = this.data.get(key);

    if (!record) {
      return null;
    }

    if (record.expiresAt && record.expiresAt < Date.now()) {
      this.data.delete(key);
      return null;
    }

    return record.value as T;
  }

  async set(key: string, value: StoreValue, ttlSeconds?: number): Promise<void> {
    this.data.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }
}

class UpstashStore implements ContractStore {
  constructor(private readonly url: string, private readonly token: string) {}

  async get<T extends StoreValue>(key: string): Promise<T | null> {
    const result = await this.command(["GET", key]);

    if (result === null || result === undefined) {
      return null;
    }

    if (typeof result !== "string") {
      return result as T;
    }

    return JSON.parse(result) as T;
  }

  async set(key: string, value: StoreValue, ttlSeconds?: number): Promise<void> {
    const command: Array<string | number> = ["SET", key, JSON.stringify(value)];

    if (ttlSeconds) {
      command.push("EX", ttlSeconds);
    }

    await this.command(command);
  }

  private async command(command: Array<string | number>): Promise<unknown> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Upstash command failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { result?: unknown; error?: string };

    if (payload.error) {
      throw new Error(`Upstash command failed: ${payload.error}`);
    }

    return payload.result;
  }
}

let singleton: ContractStore | undefined;

export const getStore = (): ContractStore => {
  if (singleton) {
    return singleton;
  }

  const url =
    getOptionalEnv("UPSTASH_REDIS_URL") ||
    getOptionalEnv("UPSTASH_REDIS_REST_URL") ||
    getOptionalEnv("UPSTASH_URL");
  const token =
    getOptionalEnv("UPSTASH_REDIS_TOKEN") ||
    getOptionalEnv("UPSTASH_REDIS_REST_TOKEN") ||
    getOptionalEnv("UPSTASH_TOKEN");

  singleton = url && token ? new UpstashStore(url, token) : new MemoryStore();

  return singleton;
};

const TTL_90_DAYS = 60 * 60 * 24 * 90;

export type AttemptStatus =
  | "created"
  | "action_required"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded";

export type AttemptRecord = StoreRecord & {
  saleorTransactionId: string;
  checkoutId: string;
  saleorApiUrl: string;
  amount: number;
  currency: string;
  channelSlug: string;
  customerEmail: string;
  sellAbroadCartId: string;
  sellAbroadOrderId: string;
  sellAbroadMerchantId: string;
  saleorOrderId: string;
  saleorOrderNumber: string;
  status: AttemptStatus;
  createdAt: string;
  updatedAt: string;
};

export const saveAttempt = async (attempt: AttemptRecord): Promise<void> => {
  const store = getStore();

  await store.set(`attempt:${attempt.saleorTransactionId}`, attempt, TTL_90_DAYS);

  if (attempt.sellAbroadCartId) {
    await store.set(
      `sellabroad-cart:${attempt.sellAbroadCartId}`,
      attempt.saleorTransactionId,
      TTL_90_DAYS
    );
  }

  if (attempt.sellAbroadOrderId) {
    await store.set(
      `sellabroad-order:${attempt.sellAbroadOrderId}`,
      attempt.saleorTransactionId,
      TTL_90_DAYS
    );
  }
};

export const getAttempt = async (saleorTransactionId: string): Promise<AttemptRecord | null> =>
  getStore().get<AttemptRecord>(`attempt:${saleorTransactionId}`);

export const resolveTransactionIdByCartId = async (cartId: string): Promise<string | null> =>
  getStore().get<string>(`sellabroad-cart:${cartId}`);

export const resolveTransactionIdByOrderId = async (orderId: string): Promise<string | null> =>
  getStore().get<string>(`sellabroad-order:${orderId}`);

export type CheckoutOrderMapping = StoreRecord & {
  saleorOrderId: string;
  saleorOrderNumber: string;
  status: "completed" | "confirmation_needed" | "failed";
};

export const saveCheckoutOrderMapping = async (
  checkoutId: string,
  mapping: CheckoutOrderMapping
): Promise<void> => {
  await getStore().set(`checkout-order:${checkoutId}`, mapping, TTL_90_DAYS);
};

export const getCheckoutOrderMapping = async (
  checkoutId: string
): Promise<CheckoutOrderMapping | null> =>
  getStore().get<CheckoutOrderMapping>(`checkout-order:${checkoutId}`);

export const getEventStatus = async (eventKey: string): Promise<string | null> =>
  getStore().get<string>(`event:${eventKey}`);

export const setEventStatus = async (eventKey: string, status: string): Promise<void> => {
  await getStore().set(`event:${eventKey}`, status, TTL_90_DAYS);
};

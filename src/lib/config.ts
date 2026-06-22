export type SellAbroadConfig = {
  baseUrl: string;
  apiKey: string;
  merchantId: string;
  sharedSecret: string;
  checkoutBaseUrl: string;
  widgetUrl: string;
};

export const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;

  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const getOptionalEnv = (key: string, fallback = ""): string => process.env[key] ?? fallback;

export const splitCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const getAllowedChannels = (): string[] =>
  splitCsv(process.env.SELLABROAD_ENABLED_CHANNELS);

export const getSellAbroadConfig = (): SellAbroadConfig => ({
  baseUrl: getEnv("SELLABROAD_BASE_URL", "https://oms.sellabroad.com").replace(/\/$/, ""),
  apiKey: getEnv("SELLABROAD_API_KEY"),
  merchantId: getEnv("SELLABROAD_MERCHANT_ID"),
  sharedSecret: getEnv("SELLABROAD_SHARED_SECRET"),
  checkoutBaseUrl: getEnv("SELLABROAD_CHECKOUT_BASE_URL", "https://app.sellabroad.com").replace(
    /\/$/,
    ""
  ),
  widgetUrl: getEnv(
    "SELLABROAD_WIDGET_URL",
    "https://app.sellabroad.com/api/widget?variant=container"
  ),
});

export const isChannelAllowed = (channelSlug: string | undefined): boolean => {
  const allowed = getAllowedChannels();

  return allowed.length === 0 || Boolean(channelSlug && allowed.includes(channelSlug));
};


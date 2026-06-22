import { getSellAbroadConfig } from "./config";

type AddressSource = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  streetAddress1?: string | null;
  streetAddress2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryArea?: string | null;
  companyName?: string | null;
  country?: { code?: string | null } | null;
};

type WeightSource = { value?: number | null; unit?: string | null } | null | undefined;

type LineSource = {
  id: string;
  quantity: number;
  variant?: {
    sku?: string | null;
    name?: string | null;
    weight?: WeightSource;
    product?: { name?: string | null; id?: string | null; weight?: WeightSource } | null;
  } | null;
  unitPrice?: { gross?: { amount: number; currency: string } | null } | null;
  totalPrice?: { gross?: { amount: number; currency: string } | null } | null;
};

type CheckoutSource = {
  id: string;
  email?: string | null;
  lines?: readonly LineSource[] | null;
  totalPrice?: { gross?: { amount: number; currency: string } | null } | null;
  subtotalPrice?: { gross?: { amount: number; currency: string } | null } | null;
  shippingPrice?: { gross?: { amount: number; currency: string } | null } | null;
  discount?: { amount: number; currency: string } | null;
  shippingAddress?: AddressSource | null;
  billingAddress?: AddressSource | null;
};

export const toMinorUnits = (amount: number): number => Math.round(amount * 100);

const mapAddress = (addr: AddressSource | null | undefined) => {
  if (!addr) return undefined;

  return {
    first_name: addr.firstName || undefined,
    last_name: addr.lastName || undefined,
    company: addr.companyName || undefined,
    address_1: addr.streetAddress1 || undefined,
    address_2: addr.streetAddress2 || undefined,
    city: addr.city || undefined,
    province: addr.countryArea || undefined,
    postal_code: addr.postalCode || undefined,
    country_code: addr.country?.code || undefined,
    phone: addr.phone || undefined,
  };
};

const weightToGrams = (w: WeightSource): number => {
  if (!w?.value) return 0;

  switch (w.unit) {
    case "KG":
      return Math.round(w.value * 1000);
    case "LB":
      return Math.round(w.value * 453.592);
    case "OZ":
      return Math.round(w.value * 28.3495);
    case "G":
    default:
      return Math.round(w.value);
  }
};

const mapLineItem = (line: LineSource) => {
  const weight =
    weightToGrams(line.variant?.weight) ||
    weightToGrams(line.variant?.product?.weight) ||
    100;

  return {
    external_product_id: line.variant?.product?.id || line.id,
    external_variant_id: line.id,
    sku: line.variant?.sku || `line-${line.id}`,
    title: line.variant?.product?.name || line.variant?.name || "Item",
    variant_title: line.variant?.name || undefined,
    quantity: line.quantity,
    unit_price: toMinorUnits(line.unitPrice?.gross?.amount ?? 0),
    weight_grams: weight,
    requires_shipping: true,
  };
};

export const buildCartCreatePayload = (params: {
  saleorTransactionId: string;
  amount: number;
  currency: string;
  checkout: CheckoutSource;
  successUrl?: string;
}) => {
  const config = getSellAbroadConfig();
  const { checkout, currency } = params;

  const shipping = toMinorUnits(checkout.shippingPrice?.gross?.amount ?? 0);
  const discount = toMinorUnits(checkout.discount?.amount ?? 0);
  // Saleor's subtotalPrice is already NET of the voucher discount (entire-order
  // vouchers are distributed across lines). The OMS requires the pre-discount
  // subtotal so that discount_cents <= subtotal_cents holds; add the voucher back
  // to recover the gross subtotal.
  const subtotal = toMinorUnits(checkout.subtotalPrice?.gross?.amount ?? params.amount) + discount;
  const total = toMinorUnits(params.amount);
  const tax = Math.max(0, total - subtotal + discount - shipping);

  return {
    external_cart_id: `saleor-tx:${params.saleorTransactionId}`,
    external_order_id: undefined as string | undefined,
    currency,
    email: checkout.email || undefined,
    items: (checkout.lines ?? []).map(mapLineItem),
    shipping_address: mapAddress(checkout.shippingAddress),
    billing_address: mapAddress(checkout.billingAddress),
    merchantSuppliedTotals: {
      subtotal_cents: subtotal,
      shipping_cents: shipping,
      tax_cents: tax,
      discount_cents: discount,
      total_cents: total,
      currency,
    },
    merchantSuccessUrl: params.successUrl || `${config.checkoutBaseUrl}/checkout/thank-you`,
  };
};

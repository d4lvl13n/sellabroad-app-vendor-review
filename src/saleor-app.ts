import { APL } from "@saleor/app-sdk/APL";
import { EnvAPL } from "@saleor/app-sdk/APL/env";
import { FileAPL } from "@saleor/app-sdk/APL/file";
import { SaleorApp } from "@saleor/app-sdk/saleor-app";

export let apl: APL;

const isVercel = process.env.VERCEL === "1";

if (isVercel || process.env.APL === "env") {
  apl = new EnvAPL({
    env: {
      token: process.env.SALEOR_APP_TOKEN ?? "",
      appId: process.env.SALEOR_APP_ID ?? "",
      saleorApiUrl: process.env.SALEOR_API_URL ?? "",
    },
  });
} else {
  apl = new FileAPL();
}

export const saleorApp = new SaleorApp({
  apl,
});

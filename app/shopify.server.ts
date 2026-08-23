import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import type { BillingConfigSubscriptionLineItemPlan } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { PAID_PLAN_NAMES, PLANS, TRIAL_DAYS } from "./lib/plans";

// Paid plans only. On the Billing API a free tier isn't a subscription at all —
// it's the absence of one — so Free is represented by having no active
// subscription rather than by a $0 charge. Keys are the plan names Shopify
// stores on the subscription, and are what getSubscription maps back.
const billing = {
  [PAID_PLAN_NAMES.pro]: {
    trialDays: TRIAL_DAYS,
    lineItems: [
      {
        amount: PLANS.pro.price,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
  } satisfies BillingConfigSubscriptionLineItemPlan,
  [PAID_PLAN_NAMES.premium]: {
    trialDays: TRIAL_DAYS,
    lineItems: [
      {
        amount: PLANS.premium.price,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
  } satisfies BillingConfigSubscriptionLineItemPlan,
};

const shopify = shopifyApp({
  billing,
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

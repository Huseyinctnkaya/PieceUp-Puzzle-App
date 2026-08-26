import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateAdmin = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { admin: (request: Request) => authenticateAdmin(request) },
}));

const getSubscription = vi.fn();
vi.mock("../services/billing.server", () => ({
  getSubscription: (...args: unknown[]) => getSubscription(...args),
}));

const startExperiment = vi.fn();
const stopExperiment = vi.fn();
const getRunningExperiment = vi.fn();
const getExperimentResults = vi.fn();
const listExperiments = vi.fn();
vi.mock("../models/experiment.server", async () => {
  const actual = await vi.importActual<
    typeof import("../models/experiment.server")
  >("../models/experiment.server");
  return {
    ...actual,
    startExperiment: (...args: unknown[]) => startExperiment(...args),
    stopExperiment: (...args: unknown[]) => stopExperiment(...args),
    getRunningExperiment: (...args: unknown[]) => getRunningExperiment(...args),
    getExperimentResults: (...args: unknown[]) => getExperimentResults(...args),
    listExperiments: (...args: unknown[]) => listExperiments(...args),
  };
});

vi.mock("../models/puzzleConfig.server", () => ({
  listPuzzleConfigs: async () => [],
}));

const { action, loader } = await import("./app.experiments");

const SHOP = "shop-ab.myshopify.com";

function givenPlan(hasABTesting: boolean, title = "Pro") {
  getSubscription.mockResolvedValue({
    plan: { title, hasABTesting, hasAnalytics: true },
  });
}

/** A form POST to the route, as the page's own fetcher would send it. */
function post(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return action({
    request: new Request("https://example.com/app/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdmin.mockResolvedValue({ session: { shop: SHOP }, admin: {} });
  getRunningExperiment.mockResolvedValue(null);
  listExperiments.mockResolvedValue([]);
});

describe("starting a test", () => {
  it("refuses a shop whose plan does not include A/B testing", async () => {
    // The loader hides the page, but hiding a form is not a control: the
    // action is reachable by anyone who can post to the route, and a started
    // experiment takes over the storefront for real.
    givenPlan(false);

    const result = await post({
      name: "Sneaky",
      variantAId: "puzzle-1",
      variantBId: "puzzle-2",
      splitPercent: "50",
    });

    expect(startExperiment).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "plan_required" });
  });

  it("lets a Premium shop start one", async () => {
    givenPlan(true, "Premium");
    startExperiment.mockResolvedValue({ id: "exp-1" });

    const result = await post({
      name: "Piece count",
      variantAId: "puzzle-1",
      variantBId: "puzzle-2",
      splitPercent: "50",
    });

    expect(startExperiment).toHaveBeenCalledWith(SHOP, {
      name: "Piece count",
      variantAId: "puzzle-1",
      variantBId: "puzzle-2",
      splitPercent: 50,
    });
    expect(result).toEqual({ started: true });
  });
});

describe("stopping a test", () => {
  it("is allowed even on a plan without A/B testing", async () => {
    // A shop that downgrades mid-test must still be able to switch it off.
    // Gating this would leave the experiment running on their storefront with
    // no way to reach it — the paywall would be holding their store hostage.
    givenPlan(false);
    stopExperiment.mockResolvedValue({ id: "exp-1", status: "STOPPED" });

    const result = await post({ intent: "stop", id: "exp-1" });

    expect(stopExperiment).toHaveBeenCalledWith(SHOP, "exp-1");
    expect(result).toEqual({ stopped: true });
  });
});

describe("the locked page", () => {
  it("offers no way in when there is nothing running", async () => {
    givenPlan(false);

    const data = await loader({
      request: new Request("https://example.com/app/experiments"),
    } as never);

    expect(data).toMatchObject({ locked: true, running: null });
  });

  it("still shows a running test so it can be stopped", async () => {
    // The downgrade case again, from the page's side.
    givenPlan(false);
    getRunningExperiment.mockResolvedValue({ id: "exp-1", name: "Old test" });

    const data = await loader({
      request: new Request("https://example.com/app/experiments"),
    } as never);

    expect(data).toMatchObject({
      locked: true,
      running: { id: "exp-1", name: "Old test" },
    });
  });
});

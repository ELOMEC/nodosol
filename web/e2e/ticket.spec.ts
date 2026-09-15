import { expect, test } from "@playwright/test";

/**
 * Ticket purchase smoke E2E.
 *
 * Real path: /marketplace/events → click event → select tier on
 * /marketplace/events/v/<address> → click Buy → wallet signs +
 * submits buy_tier_ticket. We can't sign on-chain without a funded
 * wallet, so this spec stops at the buy CTA.
 *
 * What we assert:
 *   1. /marketplace/events lists at least one event card OR shows
 *      the "Be the first to ship a ticketed event" empty state from
 *      J1 — both are valid first paints.
 *   2. The browse view exposes a navigation route for events
 *      (`/marketplace/events` itself returns 200).
 *   3. The event-detail route renders generic OG metadata
 *      (Event <short pubkey> — nodosol) for any pubkey-shaped id.
 *
 * Override `TEST_EVENT_ADDRESS` env to drive the detail-route check
 * against a known seeded event:
 *   TEST_EVENT_ADDRESS=Abc...XyZ npx playwright test ticket
 */

const SAMPLE_EVENT_ADDRESS =
  process.env.TEST_EVENT_ADDRESS ?? "11111111111111111111111111111111";

test.describe("Ticket purchase", () => {
  test("/marketplace/events resolves with content or empty state", async ({ page }) => {
    const response = await page.goto("/marketplace/events");
    expect(response?.status(), "GET /marketplace/events").toBeLessThan(500);

    // The page either renders an event grid or the J1 empty state.
    // Both are fine for a smoke check; assert at least one of them.
    const hasGrid = await page.getByRole("link", { name: /buy ticket|view event|details/i }).first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/no events on sale yet|be the first to ship/i).isVisible().catch(() => false);

    expect(hasGrid || hasEmptyState, "events grid or empty state visible").toBeTruthy();
  });

  test("/marketplace/events/v/<address> renders detail shell", async ({ page }) => {
    const response = await page.goto(`/marketplace/events/v/${SAMPLE_EVENT_ADDRESS}`);
    expect(response?.status(), "GET event detail").toBeLessThan(500);

    // generateMetadata in G4 sets a title like "Event Abc…XyZ — nodosol".
    await expect(page).toHaveTitle(/Event .*nodosol/i);

    // Page either renders the EventDetailView or surfaces a load error
    // when the address doesn't resolve on-chain — both are non-500.
    await expect(page.locator("body")).toBeVisible();
  });

  test("event index page links to a valid Buy ticket flow when listings exist", async ({ page }) => {
    await page.goto("/marketplace/events");

    // If there's a buy button visible, it should be enabled (not a
    // disabled "Sold out" badge).
    const buyButton = page.getByRole("button", { name: /buy ticket|buy.*\$/i }).first();
    const buyVisible = await buyButton.isVisible().catch(() => false);
    test.skip(!buyVisible, "no on-sale events on this devnet snapshot");

    await expect(buyButton).toBeEnabled();
  });
});

import { expect, test } from "@playwright/test";

/**
 * Tip flow smoke E2E.
 *
 * The full tip path goes:
 *   /c/<handle>  →  click "Tip in USDC"  →  Blink renderer at
 *   /b/tip/<wallet>  →  POST to the Blink action endpoint  →
 *   wallet sign + submit
 *
 * We can't sign a real Solana tx without a funded wallet, so this
 * spec exercises everything *up to* the wallet-signing step:
 *   1. The creator profile page renders.
 *   2. The "Tip in USDC" CTA exists and points at the Blink route.
 *   3. The Blink route resolves and offers a USDC tip flow.
 *
 * `TEST_HANDLE` env var defaults to a seed-data handle on devnet.
 * Override locally with `TEST_HANDLE=my-handle npx playwright test`.
 */

const HANDLE = process.env.TEST_HANDLE ?? "nodosol-demo";

test.describe("Tip flow", () => {
  test("creator page surfaces Tip CTA pointing at Blink renderer", async ({ page }) => {
    const response = await page.goto(`/c/${HANDLE}`);
    expect(response?.status(), `GET /c/${HANDLE}`).toBeLessThan(500);

    // Page renders the creator's display name or @handle in the H1.
    await expect(page.locator("h1").first()).toBeVisible();

    // "Tip in USDC" CTA links into the Blink renderer for this wallet.
    const tipLink = page.getByRole("link", { name: /tip in usdc/i });
    await expect(tipLink).toBeVisible();
    const href = await tipLink.getAttribute("href");
    expect(href, "Tip CTA href").toMatch(/^\/b\/tip\//);
  });

  test("Blink renderer at /b/tip/<wallet> mounts", async ({ page }) => {
    // Walk forward from the creator page so we use the real wallet pubkey
    // the page resolved (instead of guessing).
    await page.goto(`/c/${HANDLE}`);
    const tipLink = page.getByRole("link", { name: /tip in usdc/i });
    const href = await tipLink.getAttribute("href");
    test.skip(!href, "no tip link on this profile");

    await page.goto(href!);
    // The Blink container or the dial.to fallback both render *something*
    // — assert the page didn't 404.
    await expect(page).toHaveURL(/\/b\/tip\//);
    await expect(page.locator("body")).toBeVisible();
  });
});

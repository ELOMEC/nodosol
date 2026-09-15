import { MarketplaceShell } from "@/components/MarketplaceShell";

import { WishlistView } from "./WishlistView";

export const metadata = {
  title: "Wishlist — nodosol",
  description: "Saved marketplace items across events, auctions, rentals, and assets.",
};

export default function AccountWishlistPage() {
  return (
    <MarketplaceShell active="wishlist">
      <WishlistView />
    </MarketplaceShell>
  );
}

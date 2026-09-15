import { redirect } from "next/navigation";

export const metadata = {
  title: "Notification settings",
  description:
    "Choose which on-chain events trigger an email and where to deliver them.",
};

export default function NotificationSettingsPage() {
  redirect("/ops/notifications");
}

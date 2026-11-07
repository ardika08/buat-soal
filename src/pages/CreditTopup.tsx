import { useSearchParams } from "react-router-dom";
import { BillingTopupPage } from "@/components/billing/BillingDialog";

export default function CreditTopup() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "subscription" ? "subscription" : "topup";

  return <BillingTopupPage defaultTab={defaultTab} />;
}

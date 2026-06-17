import { BROKERS, OFFICERS, TODAY } from "@/lib/mock-data";
import { ActionsCockpit } from "@/components/actions-cockpit";

export default function ActionsPage() {
  return (
    <ActionsCockpit
      brokers={BROKERS}
      officers={OFFICERS}
      today={TODAY.toISOString()}
    />
  );
}

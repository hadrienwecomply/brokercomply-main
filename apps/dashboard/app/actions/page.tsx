import { listBrokers } from "@/lib/brokers.server";
import { OFFICERS } from "@/lib/officers";
import { ActionsCockpit } from "@/components/actions-cockpit";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const brokers = await listBrokers();
  return (
    <ActionsCockpit
      brokers={brokers}
      officers={OFFICERS}
      today={new Date().toISOString()}
    />
  );
}

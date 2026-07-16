import { notFound } from "next/navigation";
import { getProspectFile } from "@/lib/prospects.server";
import { ProspectFile } from "@/components/prospect-file";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await getProspectFile(id);
  return { title: `${file?.prospect.societe ?? "Prospect"} — BrokerComply` };
}

export default async function ProspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const file = await getProspectFile(id);
  if (!file) notFound();

  return <ProspectFile prospect={file.prospect} tasks={file.tasks} />;
}

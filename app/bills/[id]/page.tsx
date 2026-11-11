import BillClient from "@/components/BillClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BillClient id={id} />;
}

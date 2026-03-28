import { firebaseBearerHeaders } from "@/lib/api-auth-client"

export async function postSupplierWelcomeEmail(payload: {
  restaurantId: string
  supplierEmail: string
  supplierName: string
}): Promise<{ inboundAddress: string | null }> {
  const res = await fetch("/api/supplier-welcome-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await firebaseBearerHeaders()),
    },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; inboundAddress?: string | null }
  if (!res.ok) {
    throw new Error(json.error || `שגיאה ${res.status}`)
  }
  return { inboundAddress: json.inboundAddress ?? null }
}

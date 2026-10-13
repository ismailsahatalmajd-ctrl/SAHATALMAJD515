import { auth } from "@/lib/firebase"

export async function fetchOdooApi(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  try {
    const user = auth?.currentUser
    if (user && !user.isAnonymous) {
      headers.set("Authorization", `Bearer ${await user.getIdToken()}`)
    }
  } catch (e) {
    // Ignore auth token errors
  }
  return fetch(input, { ...init, headers })
}

export async function syncIssueToOdoo(issueData: { invoiceCode: string, products: { productCode: string, quantity: number }[] }) {
    try {
        const response = await fetch("/api/odoo/sync", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(issueData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to sync with Odoo");
        }

        return await response.json();
    } catch (error: any) {
        console.error("Odoo Client Error:", error);
        return { success: false, error: error.message };
    }
}

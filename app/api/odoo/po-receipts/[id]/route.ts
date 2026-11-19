import { NextResponse } from "next/server";
import { getOdooServerConfig, validateOdooServerConfig } from "@/lib/odoo-server-config";
import { authorizeOdooApi } from "@/lib/odoo-api-auth";

export const dynamic = "force-dynamic";

async function createOdooClient() {
  const ODOO_CONFIG = getOdooServerConfig();
  validateOdooServerConfig(ODOO_CONFIG);

  const odooCall = async (service: string, method: string, args: any[], kwargs?: any) => {
    const callArgs = kwargs && Object.keys(kwargs).length > 0 ? [...args, kwargs] : args;
    const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args: callArgs },
        id: Math.floor(Math.random() * 10000),
      }),
      cache: "no-store",
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.data?.message || data.error.message || "Odoo RPC Error");
    }
    return data.result;
  };

  let activeDb = ODOO_CONFIG.db;
  try {
    const listResp = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service: "db", method: "list", args: [] },
        id: 1,
      }),
    });
    const listData = await listResp.json();
    if (listData.result && listData.result.length > 0) {
      activeDb = listData.result[0];
    }
  } catch {
    // configured DB
  }

  const uid = await odooCall("common", "authenticate", [
    activeDb,
    ODOO_CONFIG.username,
    ODOO_CONFIG.apiKey,
    {},
  ]);

  return { uid, activeDb, apiKey: ODOO_CONFIG.apiKey, odooCall };
}

async function writeMoveQuantities(
  odooCall: any,
  activeDb: string,
  uid: number,
  apiKey: string,
  lines: { moveId: number; quantity: number }[]
) {
  for (const line of lines) {
    const moveId = Number(line.moveId);
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!moveId || isNaN(moveId)) continue;

    try {
      await odooCall("object", "execute_kw", [
        activeDb,
        uid,
        apiKey,
        "stock.move",
        "write",
        [[moveId], { quantity: qty, picked: qty > 0 }],
      ]);
    } catch {
      await odooCall("object", "execute_kw", [
        activeDb,
        uid,
        apiKey,
        "stock.move",
        "write",
        [[moveId], { quantity: qty }],
      ]);
    }
  }
}

export async function GET(request: Request, context: any) {
  const denied = await authorizeOdooApi(request);
  if (denied) return denied;

  try {
    const params = await context.params;
    const id = parseInt(params?.id || new URL(request.url).pathname.split("/").pop() || "");
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid Receipt ID" }, { status: 400 });
    }

    const { uid, activeDb, apiKey, odooCall } = await createOdooClient();
    if (!uid) {
      return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });
    }

    // 1. Fetch stock.picking header
    const pickings = await odooCall("object", "execute_kw", [
      activeDb,
      uid,
      apiKey,
      "stock.picking",
      "search_read",
      [[["id", "=", id]]],
      {
        fields: [
          "id",
          "name",
          "origin",
          "partner_id",
          "picking_type_id",
          "location_id",
          "location_dest_id",
          "scheduled_date",
          "date_done",
          "create_date",
          "write_date",
          "state",
          "priority",
        ],
      },
    ]);

    const receipt = pickings?.[0] || null;
    if (!receipt) {
      return NextResponse.json({ success: false, error: "Receipt not found" }, { status: 404 });
    }

    // 2. Fetch stock.move lines using description_picking (compatible with Odoo 17+)
    const moves = await odooCall("object", "execute_kw", [
      activeDb,
      uid,
      apiKey,
      "stock.move",
      "search_read",
      [[["picking_id", "=", id]]],
      {
        fields: [
          "id",
          "picking_id",
          "product_id",
          "description_picking",
          "product_uom_qty",
          "quantity",
          "product_uom",
          "state",
          "date",
          "origin",
          "reference",
          "picked",
        ],
        context: { lang: "en_US" },
      },
    ]);

    const lines = (moves || []).map((m: any) => {
      const demand = Number(m.product_uom_qty) || 0;
      const doneQty =
        m.quantity !== undefined && m.quantity !== null
          ? Number(m.quantity)
          : demand;
      const desc = m.description_picking || (Array.isArray(m.product_id) ? m.product_id[1] : "");
      return {
        id: m.id,
        picking_id: m.picking_id,
        product_id: m.product_id,
        description: desc,
        name: desc,
        display_name: desc,
        demand,
        quantity: doneQty,
        product_qty: doneQty,
        received_qty: doneQty,
        product_uom_id: m.product_uom,
        state: m.state,
        date: m.date,
        origin: m.origin || "",
        reference: m.reference || "",
        picked: Boolean(m.picked),
      };
    });

    return NextResponse.json({
      success: true,
      receipt,
      lines,
    });
  } catch (error: any) {
    console.error("Odoo PO Receipt Detail GET Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: any) {
  const denied = await authorizeOdooApi(request, true);
  if (denied) return denied;

  try {
    const params = await context.params;
    const id = parseInt(params?.id || new URL(request.url).pathname.split("/").pop() || "");
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid Receipt ID" }, { status: 400 });
    }

    const body = await request.json();
    const lines: { moveId: number; quantity: number }[] = Array.isArray(body.lines)
      ? body.lines
      : [];

    const { uid, activeDb, apiKey, odooCall } = await createOdooClient();
    if (!uid) {
      return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });
    }

    await writeMoveQuantities(odooCall, activeDb, uid, apiKey, lines);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Odoo PO Receipt PUT Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: any) {
  const denied = await authorizeOdooApi(request, true);
  if (denied) return denied;

  try {
    const params = await context.params;
    const id = parseInt(params?.id || new URL(request.url).pathname.split("/").pop() || "");
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid Receipt ID" }, { status: 400 });
    }

    const body = await request.json();
    const { uid, activeDb, apiKey, odooCall } = await createOdooClient();
    if (!uid) {
      return NextResponse.json({ success: false, error: "Authentication failed." }, { status: 401 });
    }

    if (Array.isArray(body.lines) && body.lines.length > 0) {
      await writeMoveQuantities(odooCall, activeDb, uid, apiKey, body.lines);
    }

    const result = await odooCall("object", "execute_kw", [
      activeDb,
      uid,
      apiKey,
      "stock.picking",
      "button_validate",
      [[id]],
    ]);

    if (result && typeof result === "object") {
      const resModel = result.res_model;
      const resId = result.res_id;
      if (resModel === "stock.backorder.confirmation" && resId) {
        const confirmMethod = body.createBackorder ? "process" : "process_cancel_backorder";
        await odooCall("object", "execute_kw", [
          activeDb,
          uid,
          apiKey,
          "stock.backorder.confirmation",
          confirmMethod,
          [[resId]],
        ]);
      } else if (resModel === "stock.immediate.transfer" && resId) {
        await odooCall("object", "execute_kw", [
          activeDb,
          uid,
          apiKey,
          "stock.immediate.transfer",
          "process",
          [[resId]],
        ]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Odoo PO Receipt PATCH Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

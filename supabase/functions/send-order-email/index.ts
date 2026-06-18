import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type OrderItem = {
  title?: string;
  price?: number;
  quantity?: number;
  size?: string;
};

type OrderRecord = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  delivery_notes?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function formatPrice(value: number | undefined) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[character] || character);
}

function orderHtml(order: OrderRecord) {
  const itemRows = (Array.isArray(order.items) ? order.items : []).map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eadfce;">
        <strong>${escapeHtml(item.title || "Malteaser product")}</strong>
        ${item.size ? `<br><span style="color:#74695d;">Size ${escapeHtml(item.size)}</span>` : ""}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #eadfce;text-align:center;">${Number(item.quantity || 1)}</td>
      <td style="padding:12px 0;border-bottom:1px solid #eadfce;text-align:right;">${formatPrice(item.price)}</td>
    </tr>
  `).join("");

  const address = [
    order.address_line1,
    order.address_line2,
    `${order.city}, ${order.state} ${order.pincode}`,
    order.country || "India"
  ].filter(Boolean).map(escapeHtml).join("<br>");

  return `<!doctype html>
  <html>
    <body style="margin:0;background:#f8f4ee;color:#222222;font-family:Arial,sans-serif;">
      <div style="max-width:680px;margin:0 auto;padding:36px 18px;">
        <p style="margin:0 0 10px;color:#c9a86a;font-size:12px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Malteaser order confirmation</p>
        <h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:42px;line-height:1.05;">Thank you, ${escapeHtml(order.customer_name)}.</h1>
        <p style="margin:0 0 28px;color:#6d6258;font-size:16px;line-height:1.6;">Your order has been received. Our team will review it and prepare it for shipping.</p>

        <div style="background:#ffffff;border:1px solid #eadfce;padding:24px;">
          <p style="margin:0 0 18px;"><strong>Order number:</strong> ${escapeHtml(order.order_number)}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr>
                <th style="padding:0 0 10px;text-align:left;color:#74695d;">Product</th>
                <th style="padding:0 0 10px;text-align:center;color:#74695d;">Qty</th>
                <th style="padding:0 0 10px;text-align:right;color:#74695d;">Price</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          <p style="margin:18px 0 0;text-align:right;">Subtotal: ${formatPrice(order.subtotal)}</p>
          ${order.discount ? `<p style="margin:8px 0 0;text-align:right;">Discount: - ${formatPrice(order.discount)}</p>` : ""}
          <p style="margin:10px 0 0;text-align:right;font-size:22px;"><strong>Total: ${formatPrice(order.total)}</strong></p>
        </div>

        <div style="margin-top:18px;background:#fffaf4;border:1px solid #eadfce;padding:20px;">
          <p style="margin:0 0 8px;"><strong>Delivery address</strong></p>
          <p style="margin:0;color:#6d6258;line-height:1.6;">${address}<br>${escapeHtml(order.customer_phone)}</p>
          ${order.delivery_notes ? `<p style="margin:12px 0 0;color:#6d6258;line-height:1.6;"><strong>Courier notes:</strong> ${escapeHtml(order.delivery_notes)}</p>` : ""}
        </div>

        <p style="margin:24px 0 0;color:#74695d;font-size:13px;line-height:1.6;">This is an automatic confirmation. If any detail looks incorrect, reply to this email or contact the Malteaser team.</p>
      </div>
    </body>
  </html>`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ORDER_FROM_EMAIL") || "Malteaser <orders@malteaser.in>";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ error: "Email function is not configured." }, 500);
  }

  const { order_id } = await request.json().catch(() => ({ order_id: "" }));
  if (!order_id) return json({ error: "Missing order_id." }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", order_id)
    .single();

  if (orderError || !order) {
    return json({ error: orderError?.message || "Order not found." }, 404);
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [order.customer_email],
      subject: `Malteaser order ${order.order_number}`,
      html: orderHtml(order as OrderRecord)
    })
  });

  if (!emailResponse.ok) {
    const detail = await emailResponse.text();
    await supabase.from("orders").update({ email_status: "failed" }).eq("id", order_id);
    return json({ error: "Email could not be sent.", detail }, 502);
  }

  await supabase
    .from("orders")
    .update({ email_status: "sent", email_sent_at: new Date().toISOString() })
    .eq("id", order_id);

  return json({ ok: true });
});

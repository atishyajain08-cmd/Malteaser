(function () {
  "use strict";

  const config = window.MALTEASER_SUPABASE || {};
  const client = config.url && config.anonKey && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "malteaser-customer"
      }
    })
    : null;
  const cartKey = "malteaser_cart";
  const couponKey = "malteaser_coupon";
  const lastOrderKey = "malteaser_last_order";

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(cartKey) || "[]");
    } catch {
      return [];
    }
  }

  function formatPrice(value) {
    return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function orderTotals(cart) {
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
    const discount = localStorage.getItem(couponKey) === "MALTEASER10" ? Math.round(subtotal * 0.1) : 0;
    return { subtotal, discount, total: Math.max(0, subtotal - discount) };
  }

  function orderNumber() {
    const date = new Date();
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("");
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `MLT-${stamp}-${suffix}`;
  }

  function show(message, text, type = "") {
    if (!message) return;
    message.textContent = text;
    message.dataset.type = type;
  }

  function setBusy(form, busy) {
    const button = form.querySelector("button[type='submit']");
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent.trim();
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? "Placing order..." : button.dataset.label;
  }

  function renderSummary() {
    const cart = readCart();
    const lines = document.querySelector("[data-checkout-lines]");
    const subtotal = document.querySelector("[data-checkout-subtotal]");
    const discount = document.querySelector("[data-checkout-discount]");
    const discountLine = document.querySelector("[data-checkout-discount-line]");
    const total = document.querySelector("[data-checkout-total]");
    const submit = document.querySelector("[data-checkout-form] button[type='submit']");
    const totals = orderTotals(cart);

    if (lines) {
      lines.innerHTML = cart.map((item) => `
        <article class="checkout-line">
          <span>${escapeHtml(item.title)}${item.size ? ` - ${escapeHtml(item.size)}` : ""}</span>
          <small>Qty ${Number(item.quantity || 1)}</small>
          <strong>${formatPrice(Number(item.price || 0) * Number(item.quantity || 1))}</strong>
        </article>
      `).join("") || "<p>Your cart is empty. Add products before checkout.</p>";
    }
    if (subtotal) subtotal.textContent = formatPrice(totals.subtotal);
    if (discount) discount.textContent = `- ${formatPrice(totals.discount)}`;
    if (discountLine) discountLine.hidden = !totals.discount;
    if (total) total.textContent = formatPrice(totals.total);
    if (submit) submit.disabled = cart.length === 0;
  }

  async function currentUser() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.user || null;
  }

  function orderPayload(values, cart, user) {
    const totals = orderTotals(cart);
    return {
      order_number: orderNumber(),
      customer_id: user?.id || null,
      customer_name: values.full_name.trim(),
      customer_email: values.email.trim().toLowerCase(),
      customer_phone: values.phone.trim(),
      address_line1: values.address_line1.trim(),
      address_line2: values.address_line2.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      pincode: values.pincode.trim(),
      country: "India",
      items: cart.map((item) => ({
        id: item.id,
        title: item.title,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        size: item.size || "",
        image_url: item.image_url || ""
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      status: "new",
      payment_status: "pending",
      email_status: "pending"
    };
  }

  async function requestConfirmationEmail(orderId) {
    if (!client || !orderId) return;
    try {
      await client.functions.invoke("send-order-email", { body: { order_id: orderId } });
    } catch (error) {
      console.warn("Order was saved, but the confirmation email function is not available yet.", error);
    }
  }

  async function submitOrder(form) {
    const message = form.querySelector("[data-checkout-message]");
    if (!client) {
      show(message, "The backend is not connected. Please contact Malteaser support.", "error");
      return;
    }
    const cart = readCart();
    if (!cart.length) {
      show(message, "Your cart is empty. Add products before checkout.", "error");
      return;
    }
    if (!form.reportValidity()) {
      show(message, "Please complete all required delivery details.", "error");
      return;
    }

    const values = Object.fromEntries(new FormData(form));
    setBusy(form, true);
    show(message, "Saving your order...");

    try {
      const user = await currentUser();
      const payload = orderPayload(values, cart, user);
      const { data, error } = await client
        .from("orders")
        .insert(payload)
        .select("id, order_number, customer_email, total, created_at")
        .single();
      if (error) throw error;

      localStorage.setItem(lastOrderKey, JSON.stringify({ ...payload, id: data.id, created_at: data.created_at }));
      localStorage.removeItem(cartKey);
      await requestConfirmationEmail(data.id);
      location.href = `order-confirmation.html?order=${encodeURIComponent(data.order_number)}`;
    } catch (error) {
      show(message, error.message || "Could not place the order. Please try again.", "error");
    } finally {
      setBusy(form, false);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    renderSummary();
    const form = document.querySelector("[data-checkout-form]");
    const user = await currentUser();
    if (user && form) {
      form.elements.email.value = user.email || "";
      form.elements.full_name.value = user.user_metadata?.full_name || "";
    }
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitOrder(form);
    });
  });
})();

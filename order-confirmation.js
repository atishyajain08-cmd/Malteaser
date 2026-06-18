(function () {
  "use strict";

  const lastOrderKey = "malteaser_last_order";

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

  function readLastOrder() {
    try {
      return JSON.parse(localStorage.getItem(lastOrderKey) || "null");
    } catch {
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const order = readLastOrder();
    const card = document.querySelector("[data-order-confirmation]");
    const copy = document.querySelector("[data-order-confirmation-copy]");
    if (!order || !card) return;

    card.hidden = false;
    if (copy) {
      copy.textContent = `Order ${order.order_number} has been saved. A confirmation email is being sent to ${order.customer_email}.`;
    }
    card.innerHTML = `
      <div>
        <span class="mini-kicker">Order number</span>
        <strong>${escapeHtml(order.order_number)}</strong>
      </div>
      <div>
        <span class="mini-kicker">Ship to</span>
        <p>${escapeHtml(order.customer_name)}<br>${escapeHtml(order.address_line1)}${order.address_line2 ? `<br>${escapeHtml(order.address_line2)}` : ""}<br>${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.pincode)}</p>
      </div>
      <div>
        <span class="mini-kicker">Order total</span>
        <strong>${formatPrice(order.total)}</strong>
      </div>
    `;
  });
})();

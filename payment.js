/**
 * Malteaser Payment Integration (Razorpay)
 *
 * This module handles payment processing for the Malteaser store.
 * Currently supports Razorpay for Indian market.
 *
 * Setup:
 * 1. Create account at https://razorpay.com
 * 2. Get your Key ID from Dashboard > Settings > API Keys
 * 3. Add Key ID to environment or config
 * 4. Use MalteaserPayment.initiateCheckout(orderId, amount, customer)
 */

(function () {
  "use strict";

  const RAZORPAY_KEY_ID = window.MALTEASER_RAZORPAY?.keyId || "";
  const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

  // Load Razorpay script
  function loadRazorpayScript() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load Razorpay"));
      document.head.appendChild(script);
    });
  }

  /**
   * Initiate a payment checkout
   * @param {Object} options - Payment options
   * @param {string} options.orderId - Unique order ID
   * @param {number} options.amount - Amount in paise (100 paise = 1 rupee)
   * @param {string} options.description - Order description
   * @param {Object} options.customer - Customer details
   * @param {string} options.customer.email - Customer email
   * @param {string} options.customer.phone - Customer phone (10 digits)
   * @param {string} options.customer.name - Customer name
   * @param {Function} options.onSuccess - Callback on successful payment
   * @param {Function} options.onError - Callback on failed payment
   */
  async function initiateCheckout(options) {
    if (!RAZORPAY_KEY_ID) {
      throw new Error("Razorpay Key ID not configured. Set window.MALTEASER_RAZORPAY.keyId");
    }

    try {
      await loadRazorpayScript();

      const checkoutOptions = {
        key: RAZORPAY_KEY_ID,
        amount: options.amount, // in paise
        currency: "INR",
        name: "Malteaser",
        description: options.description || "Malteaser Purchase",
        order_id: options.orderId, // Server-side order ID
        prefill: {
          name: options.customer?.name || "",
          email: options.customer?.email || "",
          contact: options.customer?.phone || ""
        },
        theme: {
          color: "#1a1a1a"
        },
        handler: (response) => {
          // Payment successful
          if (options.onSuccess) {
            options.onSuccess({
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
              signature: response.razorpay_signature
            });
          }
        },
        modal: {
          ondismiss: () => {
            if (options.onError) {
              options.onError(new Error("Payment cancelled by user"));
            }
          }
        }
      };

      const rzp = new window.Razorpay(checkoutOptions);
      rzp.open();

      // Error handler
      rzp.on("payment.failed", (response) => {
        if (options.onError) {
          options.onError(new Error(response.error.description));
        }
      });
    } catch (error) {
      if (options.onError) {
        options.onError(error);
      } else {
        throw error;
      }
    }
  }

  /**
   * Verify payment signature (server-side)
   * @param {Object} paymentData - Payment response data
   * @param {string} paymentData.paymentId - Razorpay payment ID
   * @param {string} paymentData.orderId - Razorpay order ID
   * @param {string} paymentData.signature - Razorpay signature
   * @returns {boolean} True if signature is valid
   *
   * NOTE: This requires server-side verification with your secret key
   * Client-side verification is for demo only
   */
  function verifySignature(paymentData) {
    // WARNING: Never use client-side verification in production
    // Always verify on server using Razorpay secret key
    console.warn(
      "Client-side signature verification is for testing only. " +
      "Use server-side verification with your Razorpay secret key in production."
    );

    // Placeholder - implement server-side verification
    return Boolean(
      paymentData.paymentId &&
      paymentData.orderId &&
      paymentData.signature
    );
  }

  /**
   * Create an order (server-side)
   * This is a placeholder - implement on your backend
   * @param {number} amount - Amount in rupees
   * @returns {Promise<string>} Order ID from Razorpay
   */
  async function createOrder(amount) {
    // Implementation requires:
    // 1. Backend endpoint that calls Razorpay API
    // 2. Use your Razorpay Key Secret
    // 3. Return order_id
    //
    // Example backend code (Node.js):
    // const razorpay = new Razorpay({
    //   key_id: process.env.RAZORPAY_KEY_ID,
    //   key_secret: process.env.RAZORPAY_KEY_SECRET
    // });
    // const order = await razorpay.orders.create({
    //   amount: amount * 100, // Convert to paise
    //   currency: "INR"
    // });
    // return order.id;

    throw new Error("createOrder must be implemented on backend");
  }

  /**
   * Handle payment completion
   * @param {Object} paymentData - Payment response
   * @param {Function} onSuccess - Callback on success
   * @param {Function} onError - Callback on error
   */
  async function handlePaymentCompletion(paymentData, onSuccess, onError) {
    try {
      // Send payment data to backend for verification
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentData)
      });

      const result = await response.json();

      if (result.success) {
        if (onSuccess) onSuccess(result);
      } else {
        throw new Error(result.error || "Payment verification failed");
      }
    } catch (error) {
      if (onError) onError(error);
    }
  }

  // Export API
  window.MalteaserPayment = {
    initiateCheckout,
    verifySignature,
    createOrder,
    handlePaymentCompletion,
    loadRazorpayScript
  };

  console.log("✓ Malteaser Payment module loaded");
})();

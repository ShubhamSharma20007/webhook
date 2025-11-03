const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
require("dotenv").config();

const app = express();

// ✅ Allow CORS if needed
app.use(cors({ origin: "*" }));

// ✅ Webhook route FIRST — use express.raw here
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }), // <--- RAW BODY, not parsed JSON
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
      // Important: req.body must be the raw Buffer here
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ✅ Handle events
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        console.log("✅ Payment successful:", session.id);
        break;
      case "invoice.payment_failed":
        console.log("❌ Payment failed:", event.data.object.id);
        break;
      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

// ✅ Now add JSON parser for all other routes
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Webhook server running ✅");
});

app.listen(process.env.PORT || 5000, () =>
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`)
);

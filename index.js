const dot = require("dotenv").config();
const cors = require("cors");

const express = require("express");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors("*"));
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("Webhook verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        console.log("Payment successful:", session.id);
        // ------------DB OPERATION----------------
        break;
      case "invoice.payment_failed":
        console.log("Payment failed:", event.data.object.id);
        break;
      default:
        console.log(` Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);


app.listen(process.env.PORT || 5000, () => {
  console.log('Server is running on',process.env.PORT || 5000);
});

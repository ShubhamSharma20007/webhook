require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


//  this is only experimental rouete
app.post(
  '/test/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sign = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sign, endpointSecret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout Session Completed:', session);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('Invoice Payment Failed:', invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);


// ✅ CORS setup
app.use(cors({ origin: "*" }))

// ✅ AFTER webhook route, you can safely parse JSON for all other routes
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Stripe Webhook Server Running ✅");
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

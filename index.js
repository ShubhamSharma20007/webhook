import express from "express";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ CORS and JSON parser
app.use(cors());

// ✅ Use express.json() for all routes EXCEPT /webhook
app.use((req, res, next) => {
  if (req.originalUrl === "/test/webhook") {
    next(); // skip json parsing for webhook
  } else {
    express.json()(req, res, next);
  }
});

app.get("/", (req, res) => {
  res.send("Server is running on port 8000 🚀");
});

// ✅ Checkout Session Route
app.post("/stripe-checkout-session", async (req, res) => {
  try {
    const { priceId } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: "http://localhost:5173/success",
      cancel_url: "http://localhost:5173/cancel",
      customer_email: "customer@example.com",
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "IN"],
      },
      custom_fields: [
        {
          key: "customer_name",
          label: {
            type: "custom",
            custom: "Full Name",
          },
          type: "text",
          optional: false,
        },
      ],
    });

    res.status(200).send({ session });
  } catch (error) {
    console.error("❌ Error creating checkout session:", error.message);
    res.status(500).send({ error: error.message });
  }
});
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

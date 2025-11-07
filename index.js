import express from "express";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";
import User from "./user.schema.js";
import connectDB from "./db.js";

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

connectDB()




export async function updateUserBalance(userIdOrEmail, amountChange) {
  let user = await User.findOne({ email: userIdOrEmail });

  if (!user) {
    // Auto-create user if not found
    user = await User.create({
      email: userIdOrEmail,
      name: "New User",
      balance: amountChange,
    });
    console.log(`🆕 Created new user with balance: ${user.balance}`);
  } else {
    user.balance = (user.balance || 0) + amountChange;
    await user.save();
    console.log(`💾 Updated balance for ${user.email}: ${user.balance}`);
  }
}


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
  "/test/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("⚠️ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle webhook events
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerEmail = session.customer_email;
        const amount = session.amount_total / 100;

        console.log(`✅ Payment completed: ${customerEmail} paid $${amount}`);

        // Example: add to user balance in DB
        await updateUserBalance(customerEmail, amount);

        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const amount = invoice.amount_paid / 100;

        console.log(`💰 Subscription payment succeeded for ${customerId}`);

        // Add to balance
        await updateUserBalance(customerId, amount);

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        console.log(`❌ Payment failed for ${customerId}`);
        // Optionally flag user as unpaid or deduct credits
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const amount = charge.amount_refunded / 100;
        const customerId = charge.customer;

        console.log(`💸 Refund processed for ${customerId}`);

        // Deduct from user balance
        await updateUserBalance(customerId, -amount);

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

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




async function updateUserBalance(
  identifier,
  amountChange,
  stripeCustomerId = null,
  subscriptionId = null,
  planName = null // ✅ new argument for plan name
) {
  try {
    let user = await User.findOne({
    $or: [
      { email: identifier },
      { stripeCustomerId: stripeCustomerId || identifier }
    ]
  });


    // 2️⃣ If no user exists, create a new one
    if (!user) {
      user = await User.create({
        email: identifier.includes("@") ? identifier : `unknown_${Date.now()}@placeholder.com`,
        name: "New User",
        stripeCustomerId: stripeCustomerId || null,
        subscriptionId: subscriptionId || null,
        planName: planName || "free", // ✅ store plan
        balance: amountChange,
      });

      console.log(`🆕 Created new user: ${user.email}, Plan: ${user.planName}, Balance: ${user.balance}`);
    } 
    // 3️⃣ Update existing user
    else {
      if (user) {
        if (!user.stripeCustomerId && stripeCustomerId) user.stripeCustomerId = stripeCustomerId;
        if (!user.email && identifier.includes("@")) user.email = identifier;
      }

      user.balance = (user.balance || 0) + amountChange;

      // ✅ Update Stripe-related fields if needed
      if (stripeCustomerId && !user.stripeCustomerId) {
        user.stripeCustomerId = stripeCustomerId;
      }
      if (subscriptionId && !user.subscriptionId) {
        user.subscriptionId = subscriptionId;
      }

      // ✅ Update plan name if passed
      if (planName) {
        user.planName = planName;
      }

      await user.save();
      console.log(`💾 Updated user: ${user.email}, Plan: ${user.planName}, Balance: ${user.balance}`);
    }
  } catch (err) {
    console.error("❌ Error updating user balance:", err);
  }
}

function getPlanNameFromPriceId(priceId) {
  const planMap = {
    "price_1SQlS1BVPnpSG7g8iUYo4snn": "pro_m",
    "price_1SQlSUBVPnpSG7g8sjCQiCI2": "pro_y",
  };
  return planMap[priceId] || "free";
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
  const customerId = session.customer;
  const amount = session.amount_total / 100;
  const subscriptionId = session.subscription;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
  const priceId = lineItems.data[0].price.id;
  const planName = getPlanNameFromPriceId(priceId);

  console.log(`✅ Payment completed: ${customerEmail} paid $${amount}, Plan: ${planName}`);

  await updateUserBalance(customerEmail, amount, customerId, subscriptionId, planName);
  break;
}


  case "invoice.payment_succeeded": {
const invoice = event.data.object;
  const amountPaid = invoice.amount_paid / 100;
  const customerId = invoice.customer;
  const planName = invoice.lines.data[0]?.price?.nickname || 'unknown';
  await updateUserBalance(customerId, amountPaid, customerId, invoice.subscription, planName);
    break;
  }

  case "charge.refunded": {
    const charge = event.data.object;
    const amount = charge.amount_refunded / 100;
    const customerId = charge.customer;
  const subscriptionId = session.subscription;
    console.log(`💸 Refund processed for ${customerId}`);
    await updateUserBalance(customerId, -amount, customerId,subscriptionId);
    break;
  }


case "customer.subscription.created": {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  const planId = subscription.items.data[0].price.id;
  const planName = getPlanNameFromPriceId(planId);

  console.log(`🆕 Subscription created for ${customerId} (${planName})`);

  // ✅ Just update, don’t upsert (avoid new user creation)
  await User.findOneAndUpdate(
    { stripeCustomerId: customerId },
    {
      planName,
      subscriptionId: subscription.id,
      status: "active",
    },
    { new: true }
  );

  break;
}


case "customer.subscription.updated": {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  const planId = subscription.items.data[0].price.id;
  const planName = getPlanNameFromPriceId(planId);

  console.log(`🔄 Subscription updated for ${customerId}: ${planName}`);

  await User.findOneAndUpdate(
    { stripeCustomerId: customerId },
    { plan: planName, status: "active" },
    { new: true }
  );

  break;
}

case "customer.subscription.deleted": {
  const subscription = event.data.object;
  const customerId = subscription.customer;

  console.log(`❌ Subscription canceled for ${customerId}`);

  await User.findOneAndUpdate(
    { stripeCustomerId: customerId },
    { plan: "free", status: "inactive" },
    { new: true }
  );

  break;
}

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

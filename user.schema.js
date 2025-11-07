import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    subscriptionId:{
        type:String,
        default:null
    },
    balance: {
      type: Number,
      default: 0, // start with 0 balance
    },
     planName: { type: String, default: "free" },
    status: {
      type: String,
      enum: ["active", "inactive", "unpaid"],
      default: "active",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;

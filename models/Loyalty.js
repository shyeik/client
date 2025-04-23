import mongoose from "mongoose";

const loyaltySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  orderCount: { type: Number, default: 0 },
  specialOfferEligible: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["active", "not active"],
    default: "not active",
  }, // Updated
});

const Loyalty = mongoose.model("Loyalty", loyaltySchema);

export default Loyalty;

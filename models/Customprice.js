import mongoose from "mongoose";

const customizationPriceSchema = new mongoose.Schema({
  type: { type: String, enum: ["layer", "shape"], required: true },
  key: { type: String, required: true }, // e.g., "circle", "2"
  price: { type: Number, required: true },
});

const customizationPrice = mongoose.model(
  "customizationPrice",
  customizationPriceSchema
);

export default customizationPrice;

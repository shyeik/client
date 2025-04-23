import mongoose from "mongoose";

const CartSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  customRequest: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  category: { type: String },
  flavor: { type: String },
  frosting: { type: String },
  fillings: { type: String },
  imagePath: { type: String },
  image: { type: String, required: true },
  itemType: { type: String, required: true, default: "regular" }, // Default to 'regular'
  pickupTime: { type: Date }, // Optional field
});

const Cart = mongoose.model("Cart", CartSchema);

export default Cart;

import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String }, // For local user names
  googleName: { type: String }, // For Google account names
  email: { type: String, required: true, unique: true },
  password: { type: String },
  googleId: { type: String },
  authType: { type: String, enum: ["google", "local"], default: "local" },
  image: {
    type: String,
    default: "uploads/1layer.png",
  },
});

const User = mongoose.model("User", userSchema);

export default User;

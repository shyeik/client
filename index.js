import express, { json } from "express";
import { connect } from "mongoose";
import cors from "cors";
import User from "./models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import Item from "./models/Item.js";
import multer from "multer";
import axios from "axios";
import Cart from "./models/Cart.js";
import Order from "./models/Order.js";
import Loyalty from "./models/Loyalty.js";
import compression from "compression";
import Counter from "./models/Counter.js";
import customizationPrice from "./models/Customprice.js";

const app = express();
const port = process.env.PORT || 8080;

app.use(compression()); // Enable Gzip compression

console.log("Allowed origin:", process.env.CLIENT_ORIGIN); // Debugging log

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, // Adjust as needed
    credentials: true, // Allow credentials if needed
  })
);
app.use(express.json());

app.use(json());
app.use(
  session({
    secret: "sdssf",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// GOOGLE AUTH
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },  
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            authType: "google",
          });
        }
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

const conectbco = process.env.MONGO_URI;
const jwt_secret = process.env.JWT_SECRET;

connect(conectbco)
  .then((res) => console.log(`Connection Success in DB Cloud ${res}`))
  .catch((err) =>
    console.log(`Error in connection with DataBase MongoDB ${err}`)
  );
// Routes

// Google Authentication
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

const frontendURL = process.env.FRONTEND_URL;

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    if (req.user) {
      const token = jwt.sign({ id: req.user._id }, JWT_SECRET, {
        expiresIn: "1h",
      });
      res.redirect(
        `${frontendURL}/?token=${token}&name=${encodeURIComponent(req.user.name)}&id=${req.user.id}`
      );
    } else {
      res.redirect("/login");
    }
  }
);

// Register
app.post("/Register", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ ...req.body, password: hashedPassword });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.post("/", (req, res) => {
  res.send("Error...");
});

// Login
app.post("/login", async (req, res) => {
  const { email, password, captchaToken } = req.body;

  // Verify reCAPTCHA token
  const secretKey = process.env.RECAPTCHA_SECRET_KEY; // Replace with your secret key
  const response = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify`,
    null,
    {
      params: {
        secret: secretKey,
        response: captchaToken,
      },
    }
  );

  const { success } = response.data;
  if (!success) {
    return res.status(400).json({ error: "CAPTCHA verification failed" });
  }

  try {
    const user = await User.findOne({ email });
    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1h" });
      return res.json({
        token,
        user: { name: user.name, email: user.email, _id: user._id },
      });
    }
    res.status(400).json("Invalid email or password");
  } catch (err) {
    res.status(500).json(err);
  }
});

// Token Verification
app.post("/verifyToken", (req, res) => {
  const token = req.body.token;
  if (!token) return res.status(400).json({ message: "Token is required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.status(200).json({ valid: true, decoded });
  } catch (error) {
    res.status(401).json({ valid: false, message: "Invalid or expired token" });
  }
});

// Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "../public/uploads");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Authenticate Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, "SECRET_KEY", (err, user) => {
    if (err) return res.status(403).json({ message: "Forbidden" });
    req.user = user;
    next();
  });
};

// Routes

// Update User Profile
app.put(
  "/users/:id",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const updateData = {
        name: req.body.name,
        email: req.body.email,
        ...(req.file && { image: `public/uploads/${req.file.filename}` }),
        ...(req.body.googleId && { googleId: req.body.googleId }), // Allow updating googleId
      };

      const user = await User.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
      });

      if (!user) return res.status(404).json({ message: "User not found" });

      res.status(200).json(user);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Error updating user profile", error: err.message });
    }
  }
);

app.get("/users/:id", authenticateToken, async (req, res) => {
  const userId = req.params.id;
  console.log("Received userId:", userId); // Add this log to check the value
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user" });
  }
});

// Get Items

// Get Items by Category
app.get("/items", async (req, res) => {
  try {
    const category = req.query.category; // Get category from query params
    const query = category ? { category } : {}; // If category is provided, filter by it
    const items = await Item.find(query);
    res.status(200).json({ data: items });
  } catch (error) {
    res.status(500).json({ message: "Error fetching items" });
  }
});

// Assuming this is in a file where you're setting up routes with Express
// Add item to cart (handles duplicate items)
// Add item to cart (handles duplicate items)
app.post("/carts", async (req, res) => {
  const { title, description, price, category, image, userId, itemType } =
    req.body;

  // Input validation
  if (!title || !price || !userId) {
    return res
      .status(400)
      .json({ message: "Title, price, and userId are required." });
  }

  try {
    // Check if the item already exists in the cart for this user
    const existingCart = await Cart.findOne({ title, userId });

    if (existingCart) {
      // If item exists, update the quantity
      existingCart.quantity = (existingCart.quantity || 1) + 1;
      const updatedCart = await existingCart.save();
      return res.status(200).json(updatedCart); // Return updated item
    }

    // If item does not exist, create a new cart item
    const newCart = new Cart({
      title,
      description,
      price,
      category,
      image,
      userId,
      quantity: 1,
      itemType, // Initialize quantity as 1 for new items
    });

    const savedCart = await newCart.save();
    res.status(201).json(savedCart); // Return newly added item
  } catch (error) {
    console.error("Error adding item to cart:", error);
    res
      .status(500)
      .json({ message: "Failed to add item to cart", error: error.message });
  }
});

// POST route to handle image saving and data
// Routes
app.post("/customcarts", upload.single("image"), async (req, res) => {
  try {
    const {
      userId,
      price,
      flavor,
      fillings,
      frosting,
      title,
      customRequest,
      category,
      image,
    } = req.body;
    const imagePath = req.file ? req.file.path : null; // Path to the uploaded image
    if (!userId || !flavor || !price || !imagePath) {
      return res.status(400).json({ error: "Required fields are missing" });
    }

    const newCart = new Cart({
      userId,
      price,
      title,
      customRequest,
      flavor,
      fillings,
      frosting,
      category,
      imagePath,
      image,
    });

    await newCart.save();
    res
      .status(201)
      .json({ message: "Custom cake added to cart", item: newCart });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

// Serve images statically
app.use("public/uploads", express.static("uploads"));

// Get all cart items for a specific user
app.get("/carts/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const cartItems = await Cart.find({ userId });
    res.status(200).json(cartItems);
  } catch (error) {
    console.error("Error fetching cart items:", error);
    res.status(500).json({ error: "Failed to fetch cart items" });
  }
});

// Node.js Express route to clear all cart items for a user
app.delete("/carts/clear/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    await Cart.deleteMany({ userId }); // Adjust the model name as per your schema
    res.status(200).json({ message: "Cart cleared successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error clearing cart", error });
  }
});

// Delete a specific cart item by ID
app.delete("/carts/item/:itemId", async (req, res) => {
  const { itemId } = req.params;

  try {
    const deletedItem = await Cart.findByIdAndDelete(itemId);

    if (!deletedItem) {
      return res.status(404).json({ error: "Item not found in cart" });
    }

    res.status(200).json({ message: "Item successfully deleted from cart" });
  } catch (error) {
    console.error("Error deleting item from cart:", error);
    res.status(500).json({ error: "Failed to delete item from cart" });
  }
});

// Cart Operations
app.post("/carts", authenticateToken, async (req, res) => {
  const { title, description, price, category, image, userId, itemType } =
    req.body;
  if (!title || !price || !userId) {
    return res
      .status(400)
      .json({ message: "Title, price, and userId are required." });
  }
  try {
    const newCart = new Cart({
      title,
      description,
      price,
      category,
      image,
      userId,
      itemType,
    });
    const savedCart = await newCart.save();
    res.status(201).json(savedCart);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add item to cart", error: error.message });
  }
});

// API endpoint to add to cart
app.post("/carts", async (req, res) => {
  try {
    console.log("Received data:", req.body); // Log the received data

    const { userId, title, description, price, category, image } = req.body;

    // Basic validation (add more as needed)
    if (!userId || !title || !description || !price || !category || !image) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (typeof price !== "number") {
      return res.status(400).json({ error: "Price must be a number" });
    }

    const customCart = new CustomCart({
      userId,
      title,
      description,
      price,
      category,
      image,
    });

    await customCart.save();
    res.status(201).json({ message: "Cake added to cart!" });
  } catch (error) {
    console.error("Failed to add to cart:", error);
    res.status(500).json({ error: "Failed to add cake to cart" });
  }
});

//CashOrder
// Function to get the next sequential Order ID
const getNextOrderID = async () => {
  let newOrderID;
  let isUnique = false;

  while (!isUnique) {
    const counter = await Counter.findOneAndUpdate(
      { name: "orderID" },
      { $inc: { value: 1 } },
      { new: true, upsert: true } // Create if it doesn't exist
    );

    newOrderID = counter.value.toString().padStart(3, "0"); // Format as 001, 002, etc.

    // Ensure uniqueness by checking existing orderIDs
    const existingOrder = await Order.findOne({ orderID: newOrderID });
    if (!existingOrder) {
      isUnique = true;
    }
  }

  return newOrderID;
};

// Save Order with Sequential Order ID
app.post("/save-order", async (req, res) => {
  console.log("Received order request");
  try {
    const {
      userId,
      cartItems,
      totalAmount,
      pickupDateTime,
      quantity,
      paymentMethod,
    } = req.body;

    if (!userId) {
      return res.status(400).send({ message: "User ID is required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    // Generate next order ID
    const orderID = await getNextOrderID();

    const { name: userName, email: userEmail } = user;

    const newOrder = new Order({
      orderID,
      userId,
      userName,
      userEmail,
      cartItems,
      totalAmount,
      pickupDateTime,
      paymentMethod,
      quantity,
    });

    await newOrder.save();
    res.status(201).send({ message: "Order saved successfully!", orderID });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to save order" });
  }
});

// Fetch Orders
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find();
    console.log("Fetched Orders:", orders);
    res.json({
      data: orders.map((order) => ({
        ...order._doc,
        orderID: order.orderID || "N/A",
      })),
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// Update All Order IDs in Sequence
const updateAllOrderIDs = async () => {
  try {
    const orders = await Order.find().sort({ pickupDateTime: 1 });

    if (orders.length === 0) {
      console.log("No orders found.");
      return;
    }

    // Find the highest existing orderID
    const highestOrder = await Order.findOne().sort({ orderID: -1 });
    let counter = highestOrder ? parseInt(highestOrder.orderID, 10) + 1 : 1;

    const usedOrderIDs = new Set();
    const bulkOps = [];

    for (const order of orders) {
      let newOrderID;
      do {
        newOrderID = counter.toString().padStart(3, "0");
        counter++;
      } while (usedOrderIDs.has(newOrderID));

      usedOrderIDs.add(newOrderID);

      bulkOps.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { orderID: newOrderID } },
        },
      });
    }

    await Order.bulkWrite(bulkOps);
    console.log(`✅ Updated ${orders.length} orders with unique orderIDs.`);
  } catch (error) {
    console.error("❌ Error updating order IDs:", error);
  }
};

updateAllOrderIDs();

app.get("/orders/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch orders based on userId
    const orders = await Order.find({ userId });

    console.log("Orders for userId:", userId, orders);
    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

app.put("/orders/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const newStatus = req.body.status;
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { status: newStatus },
      { new: true }
    );
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: "Error updating order status" });
  }
});

app.delete("/clear-cart/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Delete all cart items for the given userId
    const result = await Cart.deleteMany({ userId });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: "No cart items found for this user!" });
    }

    res.status(200).json({ message: "Cart cleared successfully!" });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ message: "Error clearing cart", error });
  }
});

// Increase quantity of a cart item
app.put("/carts/item/:itemId/increase", async (req, res) => {
  const { itemId } = req.params;

  try {
    const updatedItem = await Cart.findByIdAndUpdate(
      itemId,
      { $inc: { quantity: 1 } }, // Increment quantity by 1
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    res.json(updatedItem);
  } catch (error) {
    console.error("Error increasing quantity:", error);
    res.status(500).json({ error: "Failed to increase quantity" });
  }
});

// Decrease quantity of a cart item
app.put("/carts/item/:itemId/decrease", async (req, res) => {
  const { itemId } = req.params;

  try {
    const updatedItem = await Cart.findByIdAndUpdate(
      itemId,
      { $inc: { quantity: -1 } }, // Decrement quantity by 1
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    // If quantity becomes 0, remove the item from the cart
    if (updatedItem.quantity === 0) {
      await Cart.findByIdAndDelete(itemId);
    }

    res.json(updatedItem);
  } catch (error) {
    console.error("Error decreasing quantity:", error);
    res.status(500).json({ error: "Failed to decrease quantity" });
  }
});

//PAYMENT server.js
// server.js or a dedicated payment controller file
const XENDIT_SECRET_KEY =
  "xnd_production_wFB9yDK19mowAUqyJzDW7SnRjiLpRl2DehXN2uUMXJ3SHE1I0jbMG8BMqydYpjV";

const createPaymentLink = async (amount, description, orderId, remarks) => {
  try {
    const response = await axios.post(
      "https://api.xendit.co/v2/invoices",
      {
        external_id: `order-${orderId}`,
        amount,
        payer_email: User.email || "customer@example.com",
        description,
        currency: "PHP",
        success_redirect_url: `${frontendURL}/cart?status=success`,
        failure_redirect_url: `${frontendURL}/cart?status=failed`,
        metadata: { order_id: orderId, remarks },
      },
      {
        auth: {
          username: XENDIT_SECRET_KEY,
          password: "Bakery_easy05!", // Xendit uses Basic Auth (leave password empty)
        },
      }
    );

    return response.data.invoice_url; // Return checkout link
  } catch (error) {
    console.error("Xendit error:", error.response?.data || error.message);
    return null;
  }
};

// Create a payment link and save order
app.post("/create-payment-link", async (req, res) => {
  const {
    userId,
    cartItems,
    totalAmount,
    pickupDateTime,
    paymentMethod,
    quantity,
    remarks,
  } = req.body;

  if (!totalAmount) {
    return res.status(400).json({ error: "Total amount is required." });
  }

  const amount = Math.round(totalAmount); // Xendit accepts whole numbers in PHP
  const description = `Order for user: ${userId}`;

  try {
    const checkoutUrl = await createPaymentLink(
      amount,
      description,
      userId,
      remarks
    );

    if (!checkoutUrl) {
      return res.status(500).json({ error: "Failed to create payment link" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newOrder = new Order({
      userId,
      userName: user.name,
      userEmail: user.email,
      cartItems,
      totalAmount,
      pickupDateTime,
      paymentMethod,
      paymentStatus: "Pending", // Start as pending
      quantity,
      paymentLink: checkoutUrl,
      status: "Pending",
    });

    await newOrder.save();

    res.status(201).json({
      message: "Order created successfully",
      orderId: newOrder._id,
      checkoutUrl,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
});

// Webhook for Xendit Payment Updates
app.post("/webhooks/xendit", async (req, res) => {
  const webhookData = req.body;

  try {
    const { status, external_id } = webhookData; // Xendit sends `external_id` as order reference

    if (status === "PAID") {
      const orderId = external_id.replace("order-", ""); // Extract actual order ID

      const updatedOrder = await Order.findOneAndUpdate(
        { _id: orderId }, // Match by order ID
        { paymentStatus: "Paid", status: "Confirmed" }, // Update status
        { new: true }
      );

      if (!updatedOrder) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      console.log(`✅ Order ${orderId} marked as Paid`);

      return res
        .status(200)
        .json({ success: true, message: "Order updated successfully" });
    }

    res.status(200).json({ success: false, message: "Unhandled event type" });
  } catch (error) {
    console.error("❌ Error handling webhook:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Route to fetch loyalty progress
// Fetch loyalty details for a user
app.get("/loyalty/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Find the user's loyalty record by userId
    const userLoyalty = await Loyalty.findOne({ userId });

    if (!userLoyalty) {
      return res.status(404).json({ message: "Loyalty record not found" });
    }

    // Respond with orderCount and status
    res.json({
      orderCount: userLoyalty.orderCount,
      status: userLoyalty.status, // Include status in the response
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch loyalty details",
      error: error.message,
    });
  }
});

// GET all customization prices
app.get("/customization-prices", async (req, res) => {
  const prices = await customizationPrice.find();
  res.json(prices);
});

// Start Server
app.listen(port, () => {
  console.log(`Server app is listening at http://localhost:${port}`);
});

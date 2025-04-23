//Paymongo.js
import PaymongoClient from "paymongo-sdk-nodejs";

const paymongo = new PaymongoClient("YOUR_PUBLISHABLE_KEY");

const handleGCashPayment = async (clientSecret) => {
  // clientSecret from Payment Intent
  try {
    const source = await paymongo.createSource("gcash", {
      amount: 10000,
      currency: "PHP",
      redirect: {
        success: "YOUR_SUCCESS_URL",
        failed: "YOUR_FAILED_URL",
      },
    });

    // Redirect the user to GCash
    window.location.href = source.redirect.checkout_url;
  } catch (error) {
    console.error("Error creating GCash source:", error);
  }
};

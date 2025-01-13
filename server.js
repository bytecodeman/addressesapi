require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const addressesRouter = require("./addresses");

// Create Express app
const app = express();

// Middleware
app.use(bodyParser.json());

// Base URL for API routes
app.use("/csc114/api", addressesRouter);

// Fallback route for unmatched requests
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

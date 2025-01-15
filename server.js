require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const addressesRouter = require("./addresses");

// Create Express app
const app = express();

// Middleware
app.use(bodyParser.json());

// Middleware to normalize trailing slash
app.use((req, res, next) => {
  if (req.path === "/csc114/api") {
    return res.redirect(301, "/csc114/api/");
  }
  next();
});

// Proxy the GitHub Pages content
app.get("/csc114/api/", async (req, res) => {
  try {
    // Replace this URL with your GitHub Pages URL
    const githubPageUrl = "https://bytecodeman.github.io/addressesapi/";
    // Fetch the content of the GitHub page
    const response = await axios.get(githubPageUrl);

    // Set appropriate headers and send the content
    res.set("Content-Type", "text/html");
    res.send(response.data);
  } catch (error) {
    console.error("Error fetching GitHub page:", error);
    res.status(500).send("Unable to load API documentation at this time.");
  }
});

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

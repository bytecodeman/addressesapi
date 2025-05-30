const express = require("express");
const mysql = require("mysql2");
const profanity = require("./profanity");
const router = express.Router();

// Create a MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10, // Maximum number of connections in the pool
  queueLimit: 0,
});

// Test database connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Failed to connect to database:", err);
  } else {
    console.log("Connected to MySQL database.");
    connection.release(); // Release the connection back to the pool
  }
});

// Profanity-checking middleware
const profanityMiddleware = (req, res, next) => {
  const fieldsToCheck = ["name", "address", "city", "state", "zip"];
  const profaneFields = [];

  for (const field of fieldsToCheck) {
    if (req.body[field] && profanity.containsProfanity(req.body[field])) {
      profaneFields.push(field);
    }
  }

  if (profaneFields.length > 0) {
    return res.status(400).json({
      error: "Profane content detected in fields",
      fields: profaneFields,
    });
  }

  next();
};

// Middleware for basic authentication
router.use((req, res, next) => {
  const publicPaths = ["/webscrapepage"];
  if (publicPaths.includes(req.path)) {
    return next(); // Skip authentication for public paths
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header is required" });
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "ascii"
  );
  const [username, password] = credentials.split(":");

  if (
    username === process.env.AUTH_USERNAME &&
    password === process.env.AUTH_PASSWORD
  ) {
    next();
  } else {
    res.status(403).json({ error: "Invalid credentials" });
  }
});

// Routes

// Search for addresses by a keyword in any field
router.get("/addresses/search", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  try {
    const [rows] = await pool.promise().query(
      `SELECT id FROM addresses WHERE 
            name LIKE ? OR 
            address LIKE ? OR 
            city LIKE ? OR 
            state LIKE ? OR 
            zip LIKE ?`,
      Array(5).fill(`%${query}%`)
    );

    const ids = rows.map((row) => row.id);
    res.status(200).json({ ids });
  } catch (error) {
    console.error("Error during search:", error);
    res.status(500).json({ error: "Failed to search addresses" });
  }
});

// Get the total count of addresses
router.get("/addresses/count", async (req, res) => {
  try {
    const [rows] = await pool
      .promise()
      .query("SELECT COUNT(*) AS count FROM addresses");
    const count = rows[0].count;
    res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching address count:", error);
    res.status(500).json({ error: "Failed to fetch address count" });
  }
});

// Get all addresses (with optional pagination)
router.get("/addresses", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const [countResult] = await pool
      .promise()
      .query("SELECT COUNT(*) AS total FROM addresses");
    const totalRecords = countResult[0].total;

    const [rows] = await pool
      .promise()
      .query("SELECT * FROM addresses ORDER BY id LIMIT ? OFFSET ?", [
        limit,
        offset,
      ]);

    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      data: rows,
      metadata: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error(
      "Error fetching addresses:",
      error,
      error.message,
      error.stack
    );
    res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

router.get("/addresses/:id", (req, res) => {
  const { id } = req.params;
  pool.query(
    "SELECT * from (Select *, row_number() over (Order By Id) as recordNo FROM addresses) As A WHERE A.id = ?",
    [id],
    (err, results) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Database query failed", error: err });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: "Record not found" });
      }
      res.json(results[0]);
    }
  );
});

// Add a new address
router.post("/addresses", profanityMiddleware, async (req, res) => {
  const { name, address, city, state, zip } = req.body;

  if (!name || !address || !city || !state || !zip) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const [result] = await pool
      .promise()
      .query(
        "INSERT INTO addresses (name, address, city, state, zip, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [name, address, city, state, zip]
      );
    res.status(201).json({
      message: "Address added successfully",
      addressId: result.insertId,
    });
  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ error: "Failed to add address" });
  }
});

// Update an address by ID
router.put("/addresses/:id", profanityMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, address, city, state, zip } = req.body;

  if (!name || !address || !city || !state || !zip) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const [result] = await pool
      .promise()
      .query(
        "UPDATE addresses SET name = ?, address = ?, city = ?, state = ?, zip = ? WHERE id = ?",
        [name, address, city, state, zip, id]
      );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.status(200).json({ message: "Address updated successfully" });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ error: "Failed to update address" });
  }
});

// PATCH endpoint for partial updates
router.patch("/addresses/:id", profanityMiddleware, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!id) {
    return res.status(400).json({ error: "ID parameter is required" });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return res
      .status(400)
      .json({ error: "Request body must contain fields to update" });
  }

  const allowedFields = ["name", "address", "city", "state", "zip"];

  // Filter the updates to only include allowed fields
  const validUpdates = Object.keys(updates).filter((field) =>
    allowedFields.includes(field)
  );
  if (validUpdates.length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  try {
    // Validate ID exists in the database
    const [existingRows] = await pool
      .promise()
      .query("SELECT * FROM addresses WHERE id = ?", [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Build the SQL query dynamically
    const setClause = validUpdates.map((field) => `${field} = ?`).join(", ");
    const values = validUpdates.map((field) => updates[field]);

    // Add the ID at the end for the WHERE clause
    values.push(id);

    const query = `UPDATE addresses SET ${setClause} WHERE id = ?`;
    await pool.promise().query(query, values);

    res.status(200).json({ message: "Address updated successfully" });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ error: "Failed to update address" });
  }
});

// Delete an address by ID
router.delete("/addresses/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool
      .promise()
      .query("DELETE FROM addresses WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.status(200).json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ error: "Failed to delete address" });
  }
});

router.get("/webscrapepage", async (req, res) => {
  try {
    const [rows] = await pool
      .promise()
      .query("SELECT * FROM addresses ORDER BY id");
    res.render("index", { addresses: rows });
  } catch (error) {
    console.error(
      "Error fetching addresses:",
      error,
      error.message,
      error.stack
    );
    res.status(500).send("Failed to fetch addresses " + error.message);
  }
});

module.exports = router;

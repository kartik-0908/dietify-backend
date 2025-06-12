import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const apiRouter = require("./api/v1/router");


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/v1", apiRouter);
// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Dietify API is running!",
    timestamp: new Date().toISOString(),
  });
});



app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(
    `📧 Email service: ${process.env.RESEND_API_KEY ? "Resend configured" : "Resend API key missing"}`
  );
  console.log(`👥 User tracking: Enabled`);
});

export default app;

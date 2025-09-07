import express from "express";
import dotenv from "dotenv";
import { connection } from "./lib/db.js";
import { authRoutes } from "./routes/authRoutes.js";
import cors from "cors";
import job from "./lib/cron.js";
import { userRoutes } from "./routes/user.routes.js";

import { privateChatRoute } from "./routes/privateChatRoutes.js";

import cookieParser from "cookie-parser";
import { app, io, server } from "./socket/socket.js";

// const app = express();
app.use(cookieParser());
job.start();
app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://4d5f42c9af88.ngrok-free.app",
      "http://192.168.1.100:3000",
    ],
    credentials: true, // allow cookies
  })
);

dotenv.config();

const PORT = process.env.PORT || 3001;

app.use("/api/auth", authRoutes); //  finished
app.use("/api/user", userRoutes); // finished
app.use("/api/privateChat", privateChatRoute); // finished

server.listen(PORT, () => {
  connection();
  console.log(`Server started...${PORT}`);
});

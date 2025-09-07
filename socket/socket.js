import { Server } from "socket.io";
import http from "http";
import express from "express";
import { PrivateChatRoom } from "../models/PrivateChatRoom.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://4d5f42c9af88.ngrok-free.app",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://192.168.1.100:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  },
});

export const getRecipientId = (recipientId) => userSocketMap[recipientId];
const userSocketMap = {};

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const userId = socket.handshake.query.userId;

  if (userId !== "undefined") {
    userSocketMap[userId] = socket.id;
  }

  // io.emit() is used to send events to all connected clients
  io.emit("OnlineUser", Object.keys(userSocketMap));

  // Handle typing start event
  socket?.on("typing", ({ conversationId, fromUserId, toUserId, data }) => {
    console.log("User started typing:", fromUserId, "to:", toUserId);

    // Get the recipient's socket ID
    const recipientSocketId = userSocketMap[toUserId];

    if (recipientSocketId) {
      // Emit only to the specific recipient
      io.to(recipientSocketId).emit("StartTyping", {
        conversationId,
        fromUserId, // Who is typing
        data,
      });
    }
  });

  // Handle typing stop event
  socket?.on("stopTyping", ({ conversationId, fromUserId, toUserId, data }) => {
    console.log("User stopped typing:", fromUserId, "to:", toUserId);

    // Get the recipient's socket ID
    const recipientSocketId = userSocketMap[toUserId];

    if (recipientSocketId) {
      // Emit only to the specific recipient
      io.to(recipientSocketId).emit("StopTypingNow", {
        conversationId,
        fromUserId, // Who stopped typing
        data,
      });
    }
  });

  socket?.on("markMessagesAsSeen", async ({ conversationId, userId }) => {
    try {
      // await PrivateChatRoom.updateMany({_id:conversationId,messages.seen == false},{$set:{messages.seen:true}})
      await PrivateChatRoom.updateOne(
        { _id: conversationId },
        {
          $set: {
            "messages.$[elem].seen": true,
          },
        },
        {
          arrayFilters: [{ "elem.seen": false }],
        }
      );

      io.to(userSocketMap[userId]).emit("seenMessages", {
        conversationId,
        userId,
      });
    } catch (error) {
      console.log("error in markMessagesAsSeen", error);
    }
  });

  // socket.on() is used to listen events,can be used client and server side
  socket.on("disconnect", async () => {
    console.log("user disconnected", socket.id);

    if (!userId) return;

    const chatRooms = await PrivateChatRoom.find({
      participants: { $in: [userId] },
    });

    if (!chatRooms.length) {
      console.log("No chat rooms found for user");
      return;
    }

    const now = new Date();
    let updatedRooms = [];

    for (const chatRoom of chatRooms) {
      // Update or push lastSeen
      const existingSeen = chatRoom.lastSeen.find(
        (entry) => entry.user.toString() === userId.toString()
      );

      if (existingSeen) {
        existingSeen.seenAt = now;
      } else {
        chatRoom.lastSeen.push({ user: userId, seenAt: now });
      }

      await chatRoom.save();
      updatedRooms.push(chatRoom._id);

      // Notify other participants
      const otherParticipants = chatRoom.participants.filter(
        (participantId) => participantId.toString() !== userId.toString()
      );

      otherParticipants.forEach((otherUserId) => {
        const socketId = userSocketMap[otherUserId.toString()];
        if (socketId) {
          io.to(socketId).emit("liveLastSeenUpdate", userId, now);
        }
      });
    }

    delete userSocketMap[userId];
    io.emit("OnlineUser", Object.keys(userSocketMap));
  });
});
export { app, io, server };

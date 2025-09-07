import express from "express";
import { protectRoutes } from "../middleware/protectRoute.js";
import { PrivateChatRoom } from "../models/PrivateChatRoom.js";
import { User } from "../models/user.model.js";
import { getRecipientId, io } from "../socket/socket.js";

export const privateChatRoute = express.Router();

// get participants
privateChatRoute.get("/participant", protectRoutes, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all chat rooms where user is a participant AND not soft-deleted
    const chats = await PrivateChatRoom.find({
      participants: userId,
      deletedFor: { $ne: userId },
    }).populate({
      path: "participants",
      select: "username profilePic",
    });

    // Map response with chat info
    const response = chats.map((chat) => {
      const otherUser = chat.participants.find(
        (user) => user._id.toString() !== userId.toString()
      );

      return {
        chatRoomId: chat._id,
        participant: otherUser,
        lastMessage: chat?.lastMessage || null,
        lastMessageAt: chat?.lastMessageAt || null,
        lastSeen: chat.lastSeen || null,
      };
    });

    // ✅ Fetch all users except current user
    const allUsers = await User.find({ _id: { $ne: userId } }).select(
      "username profilePic"
    );

    // ✅ Merge users in chats + other users not in chat
    const usersInChats = response.map((r) => r.participant._id.toString());
    const remainingUsers = allUsers.filter(
      (u) => !usersInChats.includes(u._id.toString())
    );

    // Add remaining users as "no chat yet"
    const allParticipants = [
      ...response,
      ...remainingUsers.map((user) => ({
        chatRoomId: null, // no chat created yet
        participant: user,
        lastMessage: null,
        lastMessageAt: null,
        lastSeen: null,
      })),
    ];

    res.status(200).json({ participants: allParticipants });
  } catch (err) {
    console.error("Get participants error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// create chatRooms
privateChatRoute.post("/checkChatRoom", protectRoutes, async (req, res) => {
  try {
    const userId = req?.user?._id;
    const { recipientId } = req.body;

    const checkUser = await User.findById(recipientId);
    if (!checkUser) {
      return res.status(400).json({ message: "User not found" });
    }

    let createChatRoom = await PrivateChatRoom.findOne({
      participants: { $all: [userId, checkUser._id], $size: 2 },
    });

    if (!createChatRoom) {
      createChatRoom = await PrivateChatRoom.create({
        participants: [userId, checkUser?._id],
        messages: [],
        deletedFor: [],
        lastMessage: {
          user: userId,
          message: "No message yet",
        },
        lastMessageAt: new Date(),
      });
    }

    const getChatRoom = await PrivateChatRoom.findById(createChatRoom?._id)
      .populate({
        path: "participants",
        select: "username profilePic",
      })
      .lean(); // lean returns a plain JS object, which we can modify

    // Filter out current user from participants before sending
    getChatRoom.participants = getChatRoom.participants.filter(
      (participant) => participant._id.toString() !== userId.toString()
    );

    res.status(200).json(getChatRoom);
  } catch (error) {
    console.log("Error in createChatRoom:", error);
    res.status(500).json({ message: error.message });
  }
});
// create chatRooms

privateChatRoute.post("/createChatRoom", protectRoutes, async (req, res) => {
  try {
    const userId = req?.user?._id;
    const { recipientId } = req.body;

    const checkUser = await User.findById(recipientId);
    if (!checkUser) {
      return res.status(400).json({ message: "User not found" });
    }

    let createChatRoom = await PrivateChatRoom.findOne({
      participants: { $all: [userId, checkUser._id], $size: 2 },
    });

    if (!createChatRoom) {
      createChatRoom = await PrivateChatRoom.create({
        participants: [userId, checkUser._id],
        messages: [],
        deletedFor: [],
        lastMessage: {
          user: userId,
          message: "No message yet",
        },
        lastMessageAt: new Date(),
      });
    }

    const getChatRoom = await PrivateChatRoom.findById(createChatRoom._id)
      .populate({
        path: "participants",
        select: "username profilePic",
      })
      .lean(); // lean returns a plain JS object, which we can modify

    // Filter out current user from participants before sending
    getChatRoom.participants = getChatRoom.participants.filter(
      (participant) => participant._id.toString() !== userId.toString()
    );

    res.status(200).json(getChatRoom);
  } catch (error) {
    console.log("Error in createChatRoom:", error);
    res.status(500).json({ message: error.message });
  }
});

// send message
privateChatRoute.post("/send/:recipientId", protectRoutes, async (req, res) => {
  try {
    const { content, media = [] } = req.body;
    const { recipientId } = req.params;
    const userId = req.user._id;

    // 1. Find or create the chat room between the two users
    let chat = await PrivateChatRoom.findOne({
      participants: { $all: [userId, recipientId], $size: 2 },
    });

    if (!chat) {
      chat = await PrivateChatRoom.create({
        participants: [userId, recipientId],
        messages: [],
        deletedFor: [],
      });
    }

    // 2. Create the new message
    const newMessage = {
      sender: userId,
      content,
      media,
      sentAt: new Date(),
      seenBy: [],
      deletedFor: [],
      reactions: [],
      chatRoomId: chat._id,
    };

    // 3. Push to messages array
    chat.messages.push(newMessage);

    // 4. Update lastMessage and lastMessageAt
    chat.lastMessage = {
      user: userId,
      message: content || media[0]?.type + " message",
    };
    chat.lastMessageAt = new Date();

    // 5. Restore chat if deleted
    chat.deletedFor = chat.deletedFor.filter(
      (id) =>
        id.toString() !== userId.toString() &&
        id.toString() !== recipientId.toString()
    );

    // Save changes
    await chat.save();

    // Get the newly added message with populated sender
    const sendMessage = chat.messages[chat.messages.length - 1];
    console.log("sendMessage", sendMessage);

    await chat.populate({
      path: "messages.sender",
      select: "username profilePic _id",
    });
    const getSocketId = getRecipientId(recipientId);
    if (getSocketId) {
      io.to(getSocketId).emit("sendMessage", sendMessage);
      io.to(getSocketId).emit("updateLastMessage", sendMessage);
    }
    res.status(200).json(chat.messages[chat.messages.length - 1]);
  } catch (err) {
    console.error("Send message error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// getMessage

privateChatRoute.get(
  "/:chatRoomId/messages",
  protectRoutes,
  async (req, res) => {
    try {
      const { chatRoomId } = req.params;
      const userId = req.user._id;
      // let chat = await PrivateChatRoom.findOne({
      //   participants: { $all: [userId, recipientId], $size: 2 },
      // });
      const chat = await PrivateChatRoom.findById(chatRoomId)
        .populate({
          path: "messages.sender",
          select: "username profilePic",
        })
        .populate({
          path: "messages.reactions.user",
          select: "username profilePic",
        });

      if (!chat) {
        return res.status(200).json({ error: "Chat not found" });
      }

      if (chat.deletedFor.includes(userId)) {
        return res.status(403).json({ error: "Chat deleted for you" });
      }

      const visibleMessages = chat.messages.filter(
        (msg) => !msg.deletedFor.includes(userId)
      );

      res.status(200).json(visibleMessages || []);
    } catch (error) {
      console.log("error in getMessage", error);
      return res.status(400).json({ message: error.message });
    }
  }
);

// lastSeen
// PATCH /api/private-chats/:chatId/last-seen
privateChatRoute.post("/last-seen", protectRoutes, async (req, res) => {
  const userId = req.user._id;

  try {
    // Find all chat rooms the user is part of
    const chatRooms = await PrivateChatRoom.find({
      participants: { $in: [userId] },
    });

    if (!chatRooms.length) {
      return res.status(404).json({ error: "No chat rooms found for user" });
    }

    const now = new Date();
    let updatedRooms = [];

    for (const chatRoom of chatRooms) {
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
    }

    res.status(200).json({
      message: "Last seen updated in all relevant chat rooms",
      updatedChatRooms: updatedRooms,
    });
  } catch (err) {
    console.error("Last seen update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

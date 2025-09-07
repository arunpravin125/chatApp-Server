import express from "express";
import { protectRoutes } from "../middleware/protectRoute.js";
import { User } from "../models/user.model.js";
import { Notification } from "../models/notification.model.js";

import { getRecipientId, io } from "../socket/socket.js";
import path from "path";
import { PrivateChatRoom } from "../models/PrivateChatRoom.js";

export const userRoutes = express.Router();

// get currentUser
userRoutes.get("/", protectRoutes, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).populate([
      {
        path: "following",
        select: "username profilePic fullName followers following",
      },
      {
        path: "followers",
        select: "username profilePic fullName followers following",
      },
    ]);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(currentUser);
  } catch (error) {
    console.error("Error in getUser:", error);
    res.status(500).json({ message: "Server error in getUser" });
  }
});
// get other User
userRoutes.get("/otherUser/:id", protectRoutes, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.log("error in getUser", error);
    res.status(400).json({ message: "error in getUser" });
  }
});

// update profile
userRoutes.put("/updateProfile", protectRoutes, async (req, res) => {
  const userId = req.user._id;

  try {
    const {
      fullName,
      username,
      profilePicture,
      bio,
      email,
      isPublic,
      showEmail,
      showBirthday,
      ShowOnlineStatus,
      AllowDirectMessage,
      ShowActivityStatus,
      interests,
      Location,
      coverPhoto,
      website,
      phone,
      showPhone,
      birthday,
      isPrivate,
    } = req.body;
    console.log({ coverPhoto });
    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: "Unauthorized user" });

    const changedFields = [];

    const updateIfChanged = (field, newValue) => {
      if (typeof newValue !== "undefined" && user[field] !== newValue) {
        user[field] = newValue;
        changedFields.push(field);
      }
    };

    updateIfChanged("fullName", fullName);
    updateIfChanged("username", username);
    updateIfChanged("profilePic", profilePicture);
    updateIfChanged("bio", bio);
    updateIfChanged("email", email);
    updateIfChanged("isPrivate", isPublic);
    updateIfChanged("showEmail", showEmail);
    updateIfChanged("showBirthday", showBirthday);
    updateIfChanged("ShowActivityStatus", ShowActivityStatus);
    updateIfChanged("ShowOnlineStatus", ShowOnlineStatus);
    updateIfChanged("AllowDirectMessage", AllowDirectMessage);
    updateIfChanged("interest", interests);
    updateIfChanged("Location", Location);
    updateIfChanged("coverPhoto", coverPhoto);
    updateIfChanged("website", website);
    updateIfChanged("phoneNumber", phone);
    updateIfChanged("showNumber", showPhone);
    updateIfChanged("dateOfBirth", birthday);
    updateIfChanged("isPrivate", isPrivate);

    await user.save();

    res.status(200).json({
      message:
        changedFields.length > 0
          ? `Profile updated: ${changedFields.join(", ")}`
          : "No changes made",
      updatedProfile: user,
    });
  } catch (error) {
    console.error("Error in updateProfile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// follow user
userRoutes.post("/follow/:targetUserId", protectRoutes, async (req, res) => {
  const targetUserId = req.params.targetUserId;
  const currentUserId = req.user._id;

  if (targetUserId === currentUserId.toString()) {
    return res.status(400).json({ error: "You cannot follow yourself." });
  }

  const targetUser = await User.findById(targetUserId);
  const currentUser = await User.findById(currentUserId);

  if (!targetUser || !currentUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const alreadyRequested = targetUser.followRequests.includes(currentUserId);
  const alreadyFollowing = targetUser.followers.includes(currentUserId);

  if (alreadyFollowing) {
    targetUser.followers.pull(currentUserId);
    currentUser.following.pull(targetUserId);
    await targetUser.save();
    await currentUser.save();
    return res.status(200).json({ message: "unfollowed" });
  }
  if (alreadyRequested) {
    return res.status(200).json({ message: "Already following request send" });
  }
  // if (alreadyRequested || alreadyFollowing) {
  //   return res.status(200).json({ error: "Already following or requested" });
  // }

  if (targetUser.isPrivate) {
    // Save follow request
    targetUser.followRequests.push(currentUserId);
    await targetUser.save();

    // ➕ Create a notification
    const newNotification = await Notification.create({
      fromUser: currentUserId,
      toUser: targetUserId,
      type: "follow_request",
      message: `${currentUser.username} has requested to follow you.`,
    });

    const notification = await Notification.findById(
      newNotification?._id
    ).populate("fromUser", "username profilePic");

    const socketId = getRecipientId(targetUserId);

    io.to(socketId).emit("notificationSocket", notification);

    return res
      .status(200)
      .json({ message: "Follow request sent with notification" });
  } else {
    // Direct follow
    targetUser.followers.push(currentUserId);
    currentUser.following.push(targetUserId);

    await targetUser.save();
    await currentUser.save();

    const userId = req?.user?._id;

    let createChatRoom = await PrivateChatRoom.findOne({
      participants: { $all: [userId, targetUserId], $size: 2 },
    });

    if (!createChatRoom) {
      createChatRoom = await PrivateChatRoom.create({
        participants: [userId, targetUserId],
        messages: [],
        deletedFor: [],
        lastMessage: {
          user: userId,
          message: "No message yet",
        },
        lastMessageAt: new Date(),
      });
    }

    const checkUser = await User.findById(targetUserId);
    if (!checkUser) {
      return res.status(400).json({ message: "User not found" });
    }

    const newNotification = await Notification.create({
      fromUser: currentUserId,
      toUser: targetUserId,
      type: "follow",
      message: `${currentUser.username} has Stated following you.`,
    });

    const notification = await Notification.findById(
      newNotification?._id
    ).populate("fromUser", "username profilePic");

    const socketId = getRecipientId(targetUserId);

    io.to(socketId).emit("notificationSocket", notification);
    return res
      .status(200)
      .json({ message: "Now following and you chat", user: req.user });
  }
});

// follow accept requestList
userRoutes.post(
  "/follow/accept/:requesterId",
  protectRoutes,
  async (req, res) => {
    const requesterId = req.params.requesterId;
    const currentUserId = req.user._id;

    const currentUser = await User.findById(currentUserId);
    const requester = await User.findById(requesterId);

    if (!requester || !currentUser)
      return res.status(404).json({ error: "User not found" });

    const index = currentUser.followRequests.indexOf(requesterId);
    if (index === -1) {
      return res.status(400).json({ error: "No such follow request" });
    }

    // Accept request
    currentUser.followRequests.splice(index, 1);
    currentUser.followers.push(requesterId);
    requester.following.push(currentUserId);

    await currentUser.save();
    await requester.save();

    const userId = req?.user?._id;

    let createChatRoom = await PrivateChatRoom.findOne({
      participants: { $all: [userId, requesterId], $size: 2 },
    });

    if (!createChatRoom) {
      createChatRoom = await PrivateChatRoom.create({
        participants: [userId, requesterId],
        messages: [],
        deletedFor: [],
        lastMessage: {
          user: userId,
          message: "No message yet",
        },
        lastMessageAt: new Date(),
      });
    }

    const checkUser = await User.findById(requesterId);
    if (!checkUser) {
      return res.status(400).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Follow request accepted" });
  }
);

// follow rejects
userRoutes.post(
  "/follow/reject/:requesterId",
  protectRoutes,
  async (req, res) => {
    const requesterId = req.params.requesterId;
    const currentUserId = req.user._id;

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ error: "User not found" });

    currentUser.followRequests = currentUser.followRequests.filter(
      (id) => id.toString() !== requesterId
    );

    await currentUser.save();
    res.status(200).json({ message: "Follow request rejected" });
  }
);

// get follow requests
userRoutes.get("/follow/requests", protectRoutes, async (req, res) => {
  const currentUser = await User.findById(req.user._id).populate(
    "followRequests",
    "username profilePic"
  );
  // requests
  res.status(200).json(currentUser.followRequests);
});

// search user
userRoutes.post("/searchUser", protectRoutes, async (req, res) => {
  try {
    const { name, userId } = req.body;

    if (userId) {
      const getUserById = await User.findById(userId);
      if (!getUserById) {
        return res.status(400).json({ message: "User not found" });
      }
      return res.status(201).json(getUserById);
    }
    if (!name) {
      return res.status(400).json({ message: "Search term is required" });
    }

    const updatedName = name.toString().trim().toLowerCase();

    const users = await User.find({
      $or: [
        { username: { $regex: updatedName, $options: "i" } },
        { fullName: { $regex: updatedName, $options: "i" } },
      ],
    });

    if (!users.length) {
      return res.status(404).json({ message: "No users found" });
    }

    res.status(200).json(users);
  } catch (error) {
    console.error("error in searchUser", error);
    res.status(500).json({ message: "Server error in searchUser" });
  }
});

// getFollowers and getFollowing

userRoutes.post("/getFollowersFollowing", protectRoutes, async (req, res) => {
  try {
    const { userId, type } = req.body;

    if (!userId || !type) {
      return res.status(400).json({ message: "userId and type are required" });
    }

    const user = await User.findById(userId)
      .populate(
        "followers",
        "username profilePic name fullName following followers"
      )
      .populate(
        "following",
        "username profilePic name fullName following followers"
      );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (type === "following") {
      return res.status(200).json(user.following);
    }

    if (type === "followers") {
      return res.status(200).json(user.followers);
    }

    return res.status(400).json({ message: "Invalid type value" });
  } catch (error) {
    console.log("error in getFollowersFollowing", error);
    return res.status(500).json({ message: error.message });
  }
});

// get All User

// Get all users with relationship data
userRoutes.get("/getUsers", protectRoutes, async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Get all users except the current user
    const users = await User.find({ _id: { $ne: currentUserId } })
      .select(
        "fullName username email profilePic bio isPrivate followers followRequests following"
      )
      .populate("followers", "_id username")
      .populate("followRequests", "_id username")
      .populate("following", "_id username");

    // Also get current user's follow requests to determine pending status
    const currentUser = await User.findById(currentUserId)
      .select("followRequests")
      .populate("followRequests", "_id username");

    // Add relationship status to each user
    const usersWithStatus = users.map((user) => {
      const userObj = user.toObject();

      // Check relationship status
      const isFollowing = user.followers.some(
        (follower) => follower._id.toString() === currentUserId.toString()
      );

      const hasRequestedToFollow = user.followRequests.some(
        (request) => request._id.toString() === currentUserId.toString()
      );

      const hasPendingRequest = currentUser.followRequests.some(
        (request) => request._id.toString() === user._id.toString()
      );

      // Determine friendship status
      let friendshipStatus = null;
      if (isFollowing) {
        friendshipStatus = "friends";
      } else if (hasRequestedToFollow) {
        friendshipStatus = "requested";
      } else if (hasPendingRequest) {
        friendshipStatus = "pending";
      }

      return {
        ...userObj,
        friendshipStatus,
      };
    });

    res.status(200).json(usersWithStatus);
  } catch (error) {
    console.error("Error in getUsers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/getFindFriends
userRoutes.get("/getFindFriends", protectRoutes, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all chat rooms where the current user is a participant
    const chatRooms = await PrivateChatRoom.find({
      participants: userId,
    });

    // Extract all userIds that current user already has a chat with
    const existingUserIds = chatRooms.flatMap((room) =>
      room.participants.map((p) => p.toString())
    );

    // Include self so we don't suggest themself
    existingUserIds.push(userId.toString());

    // Find users NOT in those chat rooms
    const findFriends = await User.find({
      _id: { $nin: existingUserIds },
    }).select("username profilePic");

    res.status(200).json(findFriends);
  } catch (error) {
    console.error("error in getFindFriends:", error);
    res.status(400).json({ message: "error in getFindFriends" });
  }
});

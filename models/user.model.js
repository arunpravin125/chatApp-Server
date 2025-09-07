import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      minlen: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },

    followRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    interest: [{ type: String }],
    Location: {
      type: String,
    },
    coverPhoto: {
      type: String,
    },
    website: {
      type: String,
    },
    phoneNumber: { type: String },

    PublicProfile: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);
export const User = mongoose.model("User", userSchema);

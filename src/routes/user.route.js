import { Router } from "express";
import { loginUser, logout, registerUser, setAvatar, refreshAccessToken, changeCurrentPassword, updateUserAvatar, getUserChannelProfile, getCurrentUser, updateAccountDetails, updateUserCoverImage, getWatchHistory, getUserById, isUserLoggedIn } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middlware.js";
import { set } from "mongoose";

const router = Router()

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser
)

router.route("/set-avatar").post(
    verifyJWT,
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),

    setAvatar
);

router.route("/login").post(loginUser)

// secured routes
router.route("/logout").get(verifyJWT, logout)

router.route("/refresh-token").post(refreshAccessToken)

// taking input from user so use post
router.route("/change-password").post(verifyJWT, changeCurrentPassword)

// Taking no input from user, so use get
router.route("/current-user").get(verifyJWT, getCurrentUser)

router.route("/user-by-id").post(verifyJWT, getUserById)

// Want to update desired field not all field use patch
router.route("/update-account").patch(verifyJWT, updateAccountDetails)

router.route("/update-avatar").patch(verifyJWT, upload.single("avatar") , updateUserAvatar)

router.route("/update-cover-image").patch(verifyJWT, upload.single("coverImage") , updateUserCoverImage)

router.route("/c/:username").get(verifyJWT, getUserChannelProfile)
// router.route("/c/:username").get(verifyJWT, getUserChannelProfile)

router.route("/watch-history").get(verifyJWT, getWatchHistory)

router.route("/verification").get(isUserLoggedIn);

export default router
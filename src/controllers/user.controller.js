import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { destroyOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose, { isValidObjectId } from "mongoose";
import { signUpSchema } from "../schemas/signUpSchema.js";

const generateAccessAndRefreshTken = async (userId) => {
  
  try {

    const user = await User.findById(userId)

    // generating
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // saving in DB
    user.refreshToken = refreshToken
    await user.save({validateBeforeSave: false})

    return {accessToken, refreshToken}

  } catch (error) {
    throw new ApiError(500, error.message || "Something went wrong while generating Refresh and Access token")
  }
}

const registerUser = asyncHandler( async(req, res) => {
    const {username, email, fullName, password} = req.body;

    const validation = signUpSchema.safeParse(req.body);

    if(!validation.success) {
        const usernameErrors = validation.error.format().username?._errors || [];
        const fullNameErrors = validation.error.format().fullName?._errors || [];
        const emailErrors = validation.error.format().email?._errors || [];
        const passwordErrors = validation.error.format().password?._errors || [];
        // const allErrors = validation.error.format();

        return res
        .status(400)
        .json(
            new ApiResponse(
                400,
                {
                    "usernameError": `${usernameErrors?.length > 0 ? `${usernameErrors[0]}` : ""}`,
                    "fullNameError": `${fullNameErrors?.length > 0 ? `${fullNameErrors[0]}` : ""}`,
                    "emailError": `${emailErrors?.length > 0 ? `${emailErrors[0]}` : ""}`,
                    "passwordError": `${passwordErrors?.length > 0 ? `${passwordErrors[0]}` : ""}`,
                },
            )
        )
            // return res.json(
            //     {
            //         success: false,
            //         message: {
            //             "username": `${usernameErrors?.length > 0} ? ${usernameErrors.join(', ')} : ""`,
            //             "fullname": `${fullNameErrors?.length > 0} ? ${fullNameErrors.join(', ')} : ""`,
            //             "email": `${emailErrors?.length > 0} ? ${emailErrors.join(', ')} : ""`,
            //             "password": `${passwordErrors?.length > 0} ? ${passwordErrors.join(', ')} : ""`,
            //         }
            //     },
            //     {
            //         status: 400
            //     }
            // )
    }
    
    if(
        [username, email, fullName, password].some( (field) => field?.trim === "" )
    ) {

        return res
        .status(400)
        .json(
            new ApiResponse(
                400,
                {
                    "usernameError": `${username?.trim === "" ? "Username is required" : ""}`,
                    "fullNameError": `${fullName?.trim === "" ? "FullName is required" : ""}`,
                    "emailError": `${email?.trim === "" ? "Email is required" : ""}`,
                    "passwordError": `${password?.trim === "" ? "Password is required" : ""}`,
                },
            )
        )
    }

    
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if(existedUser) {
        return res
        .status(400)
        .json(
            new ApiResponse(
                400,
                {
                    "usernameError": `${username?.length > 0 ? "Username is already exists": ""}`,
                    "emailError": `${email?.length > 0 ? "Email is already exists": ""}`
                },
            )
        )
    }

    // Handling images
    // let avatarLocalPath;
    //  if(req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0) {
    //     avatarLocalPath = req.files?.avatar[0]?.path;
    //  }
    // const coverImageLocalPath = req.files?.avatar[0]?.path; 

    //  let coverImageLocalPath;
    //  if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
    //     coverImageLocalPath = req.files.coverImage[0].path;
    //  }

    // console.log(avatarLocalPath, " ", coverImageLocalPath);

    // upload on cloudinary - may take time
    // let avatar;
    // let coverImage;

    // if(avatar) {
    //     avatar = await uploadOnCloudinary(avatarLocalPath);
    // }

    // if(coverImage) {
    //     coverImage = await uploadOnCloudinary(coverImageLocalPath);
    // }

    // store data in db
    // DB error - high - handing code written already in index.js
    // DB present - another continent
    const user = await User.create({
        username: username.toLowerCase(),
        email,
        password,
        fullName
    })

    const {accessToken, refreshToken} = await generateAccessAndRefreshTken(user._id)

    // check user details stored in DB or not?
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken" 
    )

    // now declaring some options for cookie
    const options = {
        httpOnly: true,
        secure: true,
        expires: new Date(Date.now() + 25892000000),
        sameSite: 'None',
    }

    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registring the user")
    }

    // now we return this api response in proper format using class apiResponse
    // return res.status(200).json(createdUser)
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: createdUser, refreshToken, accessToken
            },
            "User registered successfully"
        )
    )

} )

const setAvatar = asyncHandler( async(req, res) => {
    const avatarLocalPath = req.files?.avatar[0].path;
    if (!avatarLocalPath) {
        return res.status(400).json({ error: 'Avatar file path is missing' });
    }

    console.log("Local path - ", avatarLocalPath);

    const user = await User.findById(req.user?._id);

    if(!user) {
        throw new ApiError("Something went wrong while fetching user information")
    }

    const cloudinaryResponse = await uploadOnCloudinary(avatarLocalPath);

    console.log("Cloudinary path", cloudinaryResponse);

    if(!cloudinaryResponse) {
        throw new ApiError("Something went wrong while uploading avatar on cloudinary")
    }

    user.avatar = cloudinaryResponse.url;
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200, {user}, "User avatar uploaded successfully"));
} )

const loginUser = asyncHandler( async(req, res) => {
    /*
    Algo
    User input - req.body
    email or username
    Check exist or not
    find user
    Check password from DB
    Access & refresh token
    send cookie.
    */

    // input
    const{username, email, password} = req.body

    // check
    if( !(username) && !(email)) {
        return res
        .status(400)
        .json(
            new ApiResponse(
                400,
                {
                    "userError": "Username and password is required",
                },
            )
        )
    }

    // check existance
    // db dusre continent me he
    const user = await User.findOne({
        // help to check either username or email.
        $or: [{ username }, { email }]
    })

    if(!user) {
        return res
        .status(400)
        .json(
            new ApiResponse(
                400,
                {
                    "userError": "User does not exists",
                },
            )
        )
    }

    // **becrypt he bhai await to lagega
    const isPasswordValid = await user.isPasswordCorrect(password)

    if( !isPasswordValid ) {
        return res
        .status(400)
        .json(
            new ApiResponse(
                400,
                {
                    "userError": "Credentials are wrong"
                },
            )
        )
    }

    // generating access and refresh token
    // may be take time
    const {accessToken, refreshToken} = await generateAccessAndRefreshTken(user._id)

    // now above, we save data in user but by setting accessToken and refreshToken user referencing old data so we have to again retrieve data from db but we remove password and refresh token field

    const loggedInUser = await User.findById(user._id)
    .select("-passoword -refreshToken")

    // now declaring some options for cookie
    const options = {
        httpOnly: true,
        secure: true,
        expires: new Date(Date.now() + 25892000000),
        sameSite: 'None',
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, refreshToken, accessToken
            },
            "User logged in successfully"
        )
    )
} )

const logout = asyncHandler( async(req, res) => {

    // const user = await User.findById(req.user._id)
    // user.refreshToken = undefined;
    // await user.save({validateBeforeSave: false})

    // Another Method
    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            // $set: { //this will not clearing the refresh token, below method works perfectly
            //     refreshToken: undefined,
            // }

            $unset: {
                refreshToken:1 //this removes a field from document
            }
        },
        {
            // to get updated value in response
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(
            200, user, "User logout succesfully"
        )
    )
} )

const refreshAccessToken = asyncHandler( async(req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken._id)
    
        if(!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if(user?.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, "Refresh Token is Expired or used")
        }
    
        const{accessToken, newRefreshToken} = await generateAccessAndRefreshTken(user._id)
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse( 
                200, 
                {accessToken, refreshToken: newRefreshToken},
                "Refresh token is refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error.message || "Invalid refresh token")
    }

} )


const changeCurrentPassword = asyncHandler( async (req, res) => {
    const{ oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user?._id);

    const isPasswordCorrect = user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect) {
        throw new ApiError(400, "Old password is incorrect")
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false})
    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            {}, 
            "Password is succesfully changed"
        )
    )
} )

const getCurrentUser = asyncHandler( async(req, res) => {
    
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched succesfully"))
} )

// controller for text-based data
const updateAccountDetails = asyncHandler( async(req, res) => {
    const { fullName, email } = req.body

    if(!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            },
    
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
} )

// controller for file-based data
const updateUserAvatar = asyncHandler( async(req, res) => {
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const cloudinaryReponse = await uploadOnCloudinary(avatarLocalPath)

    if(!cloudinaryReponse) {
        throw new ApiError(400, "Error while uploading Avatar on Cloudinary")
    }

    const oldAvatarToBeDeleted = req.user?.avatar;

    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                avatar: cloudinaryReponse.url
            }
        },
        {new: true}
    ).select("-password")

    await destroyOnCloudinary(oldAvatarToBeDeleted);

    return res
    .status(200)
    .json(new ApiResponse(200, {user}, "Avatar changed successfully"))
} )

// controller for file-based data
const updateUserCoverImage = asyncHandler( async(req, res) => {
    const CoverImageLocalPath = req.file?.path;

    if(!CoverImageLocalPath) {
        throw new ApiError(400, "Cover Image file is missing")
    }

    const cloudinaryReponse = await uploadOnCloudinary(CoverImageLocalPath)

    if(!cloudinaryReponse.url) {
        throw new ApiError(400, "Error while uploading cover image on Cloudinary")
    }

    const oldCoverImageToBeDestroy = req.user?.coverImage;

    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                coverImage: cloudinaryReponse.url
            }
        },
        {new: true}
    ).select("-password")

    await destroyOnCloudinary(oldCoverImageToBeDestroy);
    
    return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image changed successfully"))
} )

const getUserChannelProfile = asyncHandler( async(req, res) => {
    // When we find channel of particular user then we go the url which contains username of required user, so we take input from url
    const{username} = req.params

    if(!username?.trim()) {
        throw new ApiError(400, "Username is missing")
    }

    // working on db
    // aggregation
    const channel = await User.aggregate([
        // Stage1
        {
            $match: {
                username: username?.toLowerCase()
            }
        },

        // Stage2
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            } 
        },

        // Stage3
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },

        // Stage4
        {
            // Keep old data of particular username getting form match, but include additional fields
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },

        // Stage5
        {
            $project: {
                username: 1,
                fullname: 1,
                email: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                channelsSubscribedToCount : 1,
                isSubscribed: 1
            }
        },
        {
            $addFields: {
                user_details: {
                    $first: "$"
                }
            }
        }
    ])

    if(!channel?.length) {
        throw new ApiError(400, "Channel does not exists")
    }

    return res
    .status(200)
    .json(new ApiResponse(200, channel[0], "User channel fetched successfully"))
} )


const getWatchHistory = asyncHandler( async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        username: 1,
                                        fullName: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    { 
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            user[0].watchHistory, 
            "Watch history fetched successfully"
        )
    )
} )

const getUserById = asyncHandler( async(req, res) => {
    const userId = req.body
    if(!userId && !isValidObjectId(userId._id)) {
        throw new ApiError(400, "User id is invalid")
    }
    const user = await User.findById(userId._id).select("-passoword -refreshToken")

    if(!user) {
        throw new ApiError(400, "User does not exists")
    }

    return res
    .status(200)
    .json(new ApiResponse(400, user, "User fetched successfully"))
} )

const isUserLoggedIn = asyncHandler( async(req, res) => {
    const token = req.cookies.accessToken
    let isAuthenticated = false;
    if(token) {
        isAuthenticated = true;
    }

    return res
    .status(200)
    .json(new ApiResponse(200, {"isAuthenticated": isAuthenticated}, "Data fetched successfully"));
} )  

export {
    registerUser,
    setAvatar,
    loginUser,
    logout,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
    getUserById,
    isUserLoggedIn,
}
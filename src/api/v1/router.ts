import { Router } from "express";
const userRouter = require("./user");
const replyRouter = require("./reply");
const otpRouter = require("./otp");

const router = Router();

router.use("/user", userRouter);
router.use("/reply", replyRouter);
router.use("/otp", otpRouter);

module.exports = router;

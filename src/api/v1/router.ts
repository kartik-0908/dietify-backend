import { Router } from "express";
const userRouter = require("./user");
const replyRouter = require("./reply");
const otpRouter = require("./otp");
const userFoodRouter = require("./food");
const uWorldRouter = require("./uworld");

const router = Router();

router.use("/user", userRouter);
router.use("/reply", replyRouter);
router.use("/otp", otpRouter);
router.use("/user-food", userFoodRouter);
router.use("/uworld", uWorldRouter);

module.exports = router;

import {Router} from "express";
import {getStaffDirectory} from "../controllers/admin";
import {requireAuth, requireRole} from "../middlewares";

export const adminRouter = Router();

adminRouter.get(
  "/staff",
  requireAuth,
  requireRole("admin"),
  (request, response, next) => {
    getStaffDirectory(request, response).catch(next);
  }
);

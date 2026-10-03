import {Router} from "express";
import {getSession, patchSession} from "../controllers/session";
import {requireAuth} from "../middlewares";

export const sessionRouter = Router();

sessionRouter.get("/session", requireAuth, (request, response, next) => {
  getSession(request, response).catch(next);
});

sessionRouter.patch("/session", requireAuth, (request, response, next) => {
  patchSession(request, response).catch(next);
});

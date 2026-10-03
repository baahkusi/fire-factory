import {Router} from "express";
import {adminRouter} from "./admin";
import {sessionRouter} from "./session";

export const apiRouter = Router();

apiRouter.use(sessionRouter);
apiRouter.use("/admin", adminRouter);

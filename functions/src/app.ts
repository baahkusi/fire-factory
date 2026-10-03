import cors from "cors";
import express from "express";
import {rateLimit} from "express-rate-limit";
import {AppConfig, isAllowedOrigin} from "./config";
import {errorHandler, requestContext, sanitizeRequestMiddleware} from "./middlewares";
import {apiRouter} from "./routes";
import {useMemoryStore} from "./stores/memory";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS origin not allowed"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({limit: "1mb"}));
app.use(requestContext);
app.use(sanitizeRequestMiddleware);
app.use(
  "/api",
  rateLimit({
    legacyHeaders: false,
    limit: AppConfig.apiRateLimitMax,
    standardHeaders: "draft-7",
    windowMs: AppConfig.apiRateLimitWindowMs,
    validate: {
      trustProxy: false,
      xForwardedForHeader: false,
    },
  })
);

app.get("/health", (_request, response) => {
  response.status(200).json({
    service: AppConfig.serviceName,
    status: "ok",
    store: useMemoryStore() ? "memory" : "firestore",
  });
});

app.use("/api", apiRouter);

app.use((request, response) => {
  response.status(404).json({
    error: {code: "not-found", message: `No route for ${request.method}.`},
  });
});

app.use(errorHandler);

export default app;

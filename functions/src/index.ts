import "./env-bootstrap";
import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import app from "./app";
import {AppConfig} from "./config";

setGlobalOptions({maxInstances: 10, region: AppConfig.region});

export const api = onRequest(
  {cors: false, region: AppConfig.region},
  (request, response) => app(request, response)
);

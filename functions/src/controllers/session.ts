import type {Response} from "express";
import {AppError} from "../error";
import type {AuthedRequest} from "../middlewares";
import {appendAudit} from "../stores/audit";
import {getProfile, updateDisplayName} from "../stores/profiles";
import {displayNameSchema} from "../validators";

function requireUser(request: AuthedRequest) {
  if (!request.user) {
    throw new AppError("unauthenticated", "Sign in required.", 401);
  }
  return request.user;
}

export async function getSession(
  request: AuthedRequest,
  response: Response
): Promise<void> {
  const user = requireUser(request);
  const profile = await getProfile(user.uid);
  response.status(200).json({
    uid: user.uid,
    email: user.email ?? profile?.email ?? null,
    roles: user.roles,
    profile: profile ?? null,
  });
}

export async function patchSession(
  request: AuthedRequest,
  response: Response
): Promise<void> {
  const user = requireUser(request);
  const body = displayNameSchema.parse(request.body);
  const profile = await updateDisplayName(user.uid, body.displayName);
  await appendAudit({
    actorUid: user.uid,
    action: "profile.display_name_updated",
    target: `profiles/${user.uid}`,
  });
  response.status(200).json({profile, roles: user.roles});
}

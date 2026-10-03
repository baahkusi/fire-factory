import type {NextFunction, Request, Response} from "express";
import {z} from "zod";
import {
  AppError,
  formatZodError,
  sanitizeErrorMessage,
  statusForCode,
} from "./error";
import {sanitizeInput} from "./lib/sanitize";
import {auth} from "./providers/firebase";
import {getProfile, touchProfile} from "./stores/profiles";
import {findStaffByEmail} from "./stores/staff";
import {PRIVILEGED_ROLES, ROLES, type Role, type StaffGrant} from "./types/domain";

export interface AuthedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    roles: Role[];
  };
}

export function normalizeRoles(raw: unknown): Role[] {
  if (!Array.isArray(raw)) return [];
  const found = raw.filter(
    (role): role is Role =>
      typeof role === "string" && ROLES.includes(role as Role)
  );
  return [...new Set(found)];
}

function hasPrivileged(roles: Role[]): boolean {
  return roles.some((role) => PRIVILEGED_ROLES.includes(role));
}

/**
 * Privileged assignment wins in this order:
 * 1. active staff directory row for the email
 * 2. inactive staff directory row forces member
 * 3. profile.roles when they include operator or admin
 * 4. Firebase custom claims
 * 5. member
 */
export function resolveRoles(input: {
  claimsRoles?: unknown;
  profileRoles?: unknown;
  staff?: StaffGrant | null;
}): Role[] {
  if (input.staff) {
    if (!input.staff.active) return ["member"];
    const staffRoles = normalizeRoles(input.staff.roles);
    if (hasPrivileged(staffRoles)) return staffRoles;
  }
  const fromProfile = normalizeRoles(input.profileRoles);
  if (hasPrivileged(fromProfile)) return fromProfile;
  const fromClaims = normalizeRoles(input.claimsRoles);
  if (hasPrivileged(fromClaims)) return fromClaims;
  if (fromProfile.length > 0) return fromProfile;
  if (fromClaims.length > 0) return fromClaims;
  return ["member"];
}

/** Header shim for unit tests only. Never honored by the local server default. */
export function allowTestAuth(): boolean {
  return process.env.NODE_ENV === "test";
}

export const requestContext = (
  _request: Request,
  response: Response,
  next: NextFunction
): void => {
  response.setHeader("x-content-type-options", "nosniff");
  next();
};

export const sanitizeRequestMiddleware = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  if (request.body && typeof request.body === "object") {
    request.body = sanitizeInput(request.body);
  }
  if (request.query && typeof request.query === "object") {
    request.query = sanitizeInput(request.query) as Request["query"];
  }
  if (request.params && typeof request.params === "object") {
    request.params = sanitizeInput(request.params);
  }
  next();
};

async function attachUser(
  request: AuthedRequest,
  uid: string,
  email: string | undefined,
  claimsRoles: unknown,
  displayName?: string
): Promise<void> {
  const staff = email ? await findStaffByEmail(email) : undefined;
  const existing = await getProfile(uid);
  const roles = resolveRoles({
    claimsRoles,
    profileRoles: existing?.roles,
    staff,
  });
  request.user = {uid, email, roles};
  if (email) {
    await touchProfile({uid, email, displayName, roles}).catch(() => {
      /* profile persist must not block a valid session */
    });
  }
}

export async function requireAuth(
  request: AuthedRequest,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const testUser = request.header("x-test-user");
    if (testUser && allowTestAuth()) {
      const [uid, email, rolesRaw] = testUser.split("|");
      if (!uid) {
        throw new AppError("unauthenticated", "Sign in required.", 401);
      }
      await attachUser(
        request,
        uid,
        email || undefined,
        rolesRaw?.split(",").filter(Boolean)
      );
      next();
      return;
    }
    if (testUser && !allowTestAuth()) {
      throw new AppError(
        "unauthenticated",
        "Sign in required. Test sessions are not accepted here.",
        401
      );
    }

    const header = request.header("authorization") ?? "";
    const match = /^Bearer (.+)$/i.exec(header);
    if (!match) {
      throw new AppError(
        "unauthenticated",
        "Your session has expired. Please sign in again.",
        401
      );
    }
    const decoded = await auth().verifyIdToken(match[1]);
    await attachUser(
      request,
      decoded.uid,
      decoded.email,
      decoded.roles,
      typeof decoded.name === "string" ? decoded.name : undefined
    );
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(
      new AppError(
        "unauthenticated",
        "Your session has expired. Please sign in again.",
        401
      )
    );
  }
}

export function requireRole(...allowed: Role[]) {
  return (
    request: AuthedRequest,
    _response: Response,
    next: NextFunction
  ): void => {
    const roles = request.user?.roles ?? [];
    if (!roles.some((role) => allowed.includes(role))) {
      next(new AppError("forbidden", "Insufficient role.", 403));
      return;
    }
    next();
  };
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction
): void {
  void next;
  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: {code: "invalid-request", message: formatZodError(error)},
    });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status || statusForCode(error.code)).json({
      error: {code: error.code, message: sanitizeErrorMessage(error.message)},
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(error);

  let raw = "";
  if (error && typeof error === "object" && "message" in error) {
    raw = String((error as {message: unknown}).message);
  }
  if (/FAILED_PRECONDITION|requires an index|The query requires/i.test(raw)) {
    response.status(503).json({
      error: {
        code: "internal",
        message:
          "The database is still preparing an index. Try again in a moment.",
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: "internal",
      message: "An unexpected error occurred. Please try again later.",
    },
  });
}

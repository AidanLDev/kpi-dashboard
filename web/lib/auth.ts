"use client";

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

const userPool = new CognitoUserPool({
  UserPoolId: "eu-west-2_61gIHVu8G",
  ClientId: "6r0ttidjbo73f48ol67gqr5iv2",
});

export type SignInResult =
  | { status: "success"; token: string }
  | { status: "totp_required"; user: CognitoUser };

export function signIn(
  username: string,
  password: string
): Promise<SignInResult> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: username, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session) =>
        resolve({
          status: "success",
          token: session.getAccessToken().getJwtToken(),
        }),
      onFailure: (err) => reject(err),
      totpRequired: () => resolve({ status: "totp_required", user }),
      mfaRequired: () => resolve({ status: "totp_required", user }),
    });
  });
}

export function confirmTotp(
  user: CognitoUser,
  code: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    user.sendMFACode(
      code,
      {
        onSuccess: (session) =>
          resolve(session.getAccessToken().getJwtToken()),
        onFailure: (err) => reject(err),
      },
      "SOFTWARE_TOKEN_MFA"
    );
  });
}

export function getSession(): Promise<string> {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) return reject(new Error("No authenticated user"));

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) return reject(err ?? new Error("Session invalid"));
      resolve(session.getAccessToken().getJwtToken());
    });
  });
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
}

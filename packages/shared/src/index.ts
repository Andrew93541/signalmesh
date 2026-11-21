// Code shared by the web and mobile apps: types, API client, validation, utils.

export const APP_NAME = "SignalMesh";

export function greet(platform: "web" | "mobile"): string {
  return `Hello from ${APP_NAME} (${platform})`;
}

import process from "node:process";

import { processDueEmailNotifications } from "../lib/email-notifications.server";

const authorize = (request) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") || "";

  return authHeader === `Bearer ${cronSecret}`;
};

const processNotifications = async (request) => {
  if (!authorize(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await processDueEmailNotifications();

  return Response.json({
    ok: true,
    processed: results.length,
    results,
  });
};

export const action = async ({ request }) => processNotifications(request);

export const loader = async ({ request }) => processNotifications(request);

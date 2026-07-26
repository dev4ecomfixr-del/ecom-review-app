import { authenticate } from "../shopify.server";
import { scheduleOrderEmailNotification } from "../lib/email-notifications.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const result = await scheduleOrderEmailNotification(shop, payload);

  if (!result.queued) {
    console.log(`Email notification skipped for ${shop}: ${result.reason}`);
  }

  return new Response();
};

import { authenticate } from "../shopify.server";
import { scheduleOrderEmailNotification } from "../lib/email-notifications.server";
import { awardPointsForOrder } from "../lib/reward-points.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Schedule email review request
  try {
    const result = await scheduleOrderEmailNotification(shop, payload);
    if (!result.queued) {
      console.log(`Email notification skipped for ${shop}: ${result.reason}`);
    }
  } catch (err) {
    console.warn("Failed to schedule email notification:", err?.message);
  }

  // Award purchase reward points
  try {
    const pointResult = await awardPointsForOrder(shop, payload);
    if (pointResult.awarded) {
      console.log(`Awarded ${pointResult.points} points to ${pointResult.customerEmail} for shop ${shop}`);
    } else {
      console.log(`Points not awarded for ${shop}: ${pointResult.reason}`);
    }
  } catch (err) {
    console.warn("Failed to award reward points:", err?.message);
  }

  return new Response();
};

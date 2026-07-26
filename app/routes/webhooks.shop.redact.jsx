import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR webhook: erase all data for a shop after uninstall + 48 h grace period.
export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);

  await db.pendingEmailNotification.deleteMany({ where: { shop } });
  await db.emailNotificationSetting.deleteMany({ where: { shop } });
  await db.filterWord.deleteMany({ where: { shop } });
  await db.shopPlan.deleteMany({ where: { shop } });
  await db.review.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};

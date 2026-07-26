import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR webhook: erase all personal data for a specific customer.
export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);
  const customerEmail = payload?.customer?.email;

  if (customerEmail) {
    await db.pendingEmailNotification.deleteMany({
      where: { shop, customerEmail },
    });

    await db.review.updateMany({
      where: { shop, customerEmail },
      data: { customerEmail: null, customerName: "Deleted customer" },
    });
  }

  return new Response();
};

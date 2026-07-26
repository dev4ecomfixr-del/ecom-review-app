import { authenticate } from "../shopify.server";

// Mandatory GDPR webhook: customer requests a copy of their personal data.
// Acknowledge receipt — fulfil the data report manually per your privacy policy.
export const action = async ({ request }) => {
  await authenticate.webhook(request);
  return new Response();
};

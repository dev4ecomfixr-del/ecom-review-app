export default {
  // Configure allowedActionOrigins to allow Shopify Admin iframe form action requests (CSRF protection)
  allowedActionOrigins: [
    "admin.shopify.com",
    "*.myshopify.com",
    "**.myshopify.com",
    "*.shopify.com",
    "**.shopify.com",
    "*.spin.dev",
    "**.spin.dev",
    "review-lift-miki.ecomfixr.com",
    "*.ecomfixr.com",
    "localhost:*",
    "127.0.0.1:*",
  ],
};

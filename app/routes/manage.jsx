import fs from "node:fs";
import path from "node:path";

export const loader = async () => {
  const filePath = path.resolve(process.cwd(), "manage-dashboard.html");
  const html = fs.readFileSync(filePath, "utf-8");

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export default function Manage() {
  return null;
}


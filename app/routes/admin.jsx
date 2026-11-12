import fs from "node:fs";
import path from "node:path";

export const loader = async () => {
  const possiblePaths = [
    path.resolve(process.cwd(), "manage-dashboard.html"),
    path.resolve(process.cwd(), "../manage-dashboard.html"),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../manage-dashboard.html"),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), "../manage-dashboard.html"),
  ];

  let html = null;
  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) {
      html = fs.readFileSync(candidate, "utf-8");
      break;
    }
  }

  if (!html) {
    return new Response("Dashboard template not found", { status: 404 });
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

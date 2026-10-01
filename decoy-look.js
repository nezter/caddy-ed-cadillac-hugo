const fs = require("fs");
const R = "D:/Projects/caddy-ed-cadillac-hugo/site/public/";
for (const [f, needle] of [["index.html", "window.CADDY_CONNECT"], ["index.html", "window.CADDY_STOCK_FALLBACK"], ["admin/favourites/index.html", "window.FAVOURITES_VEHICLES"]]) {
  const s = fs.readFileSync(R + f, "utf8");
  let i = -1, n = 0;
  while ((i = s.indexOf(needle, i + 1)) !== -1 && n < 6) {
    n++;
    console.log("## " + f + " occurrence " + n + " at " + i);
    console.log("   ..." + s.slice(Math.max(0, i - 60), i + 130).replace(/\n/g, "\\n") + "...");
  }
  console.log("");
}

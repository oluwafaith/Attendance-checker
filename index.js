// Root entrypoint forwarding to compiled Express server in dist/
// This ensures platforms like Render work even if the Start Command defaults to `node index.js`
require("./dist/server.js");

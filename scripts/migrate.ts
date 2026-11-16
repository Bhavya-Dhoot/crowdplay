// Applies Drizzle migrations to DATABASE_URL (or the embedded PGlite dir). Also runs on server boot.
import { getDb } from "../src/lib/db/client";

getDb()
  .then(() => {
    console.log("migrations applied");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

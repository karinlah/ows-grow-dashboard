/** שליפה חד-פעמית מהטרמינל: npm run ingest */

require('dotenv').config();

const { runIngest } = require('../lib/ingest');

runIngest()
  .then((stats) => {
    if (stats.error) {
      console.error('השליפה נכשלה:', stats.error);
      process.exit(1);
    }
    console.log(
      `נסרקו ${stats.scanned} מיילים · ${stats.added} עסקאות חדשות · ` +
        `${stats.duplicates} כבר היו · ${stats.failed} נכשלו`
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

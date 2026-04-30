// OpenNext Cloudflare config. Stock setup; we don't need KV/R2 caching for
// the hackathon demo (every Optimise mints fresh state in-memory anyway).

import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});

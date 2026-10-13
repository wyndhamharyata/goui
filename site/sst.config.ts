/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "goui-site",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "cloudflare",
      providers: { cloudflare: "6.15.0" },
    };
  },
  async run() {
    // Only named stages own a domain, so a personal `sst dev` stage cannot claim the live host.
    const hosts: Record<string, string> = {
      production: "goui.mwyndham.dev",
      dev: "goui-dev.mwyndham.dev",
    };

    const web = new sst.cloudflare.Worker("Web", {
      handler: "src/worker/index.ts",
      domain: hosts[$app.stage],
      url: true,
      assets: {
        directory: "public",
        notFoundHandling: "404-page",
      },
    });

    new sst.x.DevCommand("Local", {
      dev: { command: "npx wrangler dev", autostart: false },
    });

    return { url: web.url, host: hosts[$app.stage] };
  },
});

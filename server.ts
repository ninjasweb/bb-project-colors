import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi): Promise<void> {
  bb.log.info("Project Colors loaded");
}

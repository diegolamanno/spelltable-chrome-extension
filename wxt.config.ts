import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  manifest: {
    name: "EDH Score Recorder",
    version: "0.1",
    description:
      "Allows you to easily record your games into a friend playground database",
    permissions: ["scripting", "storage", "activeTab"],
    host_permissions: [
      "https://spelltable.wizards.com/game/*",
      "https://convoke.games/en/play/*",
      "https://api.notion.com/*",
    ],
    icons: { "128": "/logo.png" },
  },
  vite: () => ({
    plugins: [react(), tailwindcss()],
  }),
});

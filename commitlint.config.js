const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "server",
        "receiver",
        "sender-web",
        "sender-desktop",
        "sender-mobile",
        "protocol",
        "sender-core",
        "repo",
        "deps",
        "ci",
        "docs",
        "release",
      ],
    ],
    "scope-empty": [1, "never"],
  },
};

export default config;
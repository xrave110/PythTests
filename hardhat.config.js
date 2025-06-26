require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./src", // same as foundry’s contracts/
    tests: "./test/hardhat", // separate folder for JS/TS tests
    cache: "./cache/hardhat",
    artifacts: "./out", // points to forge’s out/ directory
  },
  solidity: {
    compilers: [{ version: "0.8.20" }],
    settings: {
      remappings: ["forge-std/=lib/forge-std/src/"],
    },
  },
};

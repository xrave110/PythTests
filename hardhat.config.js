require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-foundry");

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
  networks: {
    hardhat: {
      forking: {
        url: "https://mainnet.base.org",
        // blockNumber: 32069438,
        enabled: true,
      },
      chainId: 8453,
      // Add hardfork history for Base
      chains: {
        8453: {
          hardforkHistory: {
            london: 0, // Base launched post-London
            berlin: 0,
            istanbul: 0,
            petersburg: 0,
            constantinople: 0,
            byzantium: 0,
            shanghai: 4370000, // Approximate Shanghai activation on Base
            cancun: 11188936, // Cancun upgrade on Base
          },
        },
      },
    },
  },
  mocha: {
    timeout: 120000, // Increase timeout for network calls
  },
};

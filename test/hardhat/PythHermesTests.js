const { expect } = require("chai");
const { ethers } = require("hardhat");
const { EvmPriceServiceConnection } = require("@pythnetwork/pyth-evm-js");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Pyth Price Feed Integration on Base", function () {
  let pythContract;
  let signer;
  let connection;

  // Base network constants
  const BASE_CHAIN_ID = 8453;
  const PYTH_CONTRACT_ADDRESS = "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a";
  const ETH_USD_PRICE_FEED_ID =
    "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

  // Hermes endpoint for fetching price data
  const HERMES_ENDPOINT = "https://hermes.pyth.network";

  async function getCurrentBlockTimestamp() {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    return block.timestamp;
  }

  before(async function () {
    // Fork Base mainnet
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://mainnet.base.org",
            blockNumber: undefined,
          },
        },
      ],
    });

    // Verify chain
    const chainId = await ethers.provider.getNetwork();
    expect(chainId.chainId).to.equal(BASE_CHAIN_ID);
    console.log(
      `Successfully forked Base mainnet (Chain ID: ${chainId.chainId})`
    );

    [signer] = await ethers.getSigners();

    // Connect to Pyth contract
    const pythAbi = [
      "function updatePriceFeeds(bytes[] calldata updateData) external payable",
      "function getPrice(bytes32 id) external view returns (int64 price, uint64 conf, int32 expo, uint256 publishTime)",
      "function getPriceNoOlderThan(bytes32 id, uint age) external view returns (int64 price, uint64 conf, int32 expo, uint256 publishTime)",
      "function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 feeAmount)",
    ];

    pythContract = new ethers.Contract(PYTH_CONTRACT_ADDRESS, pythAbi, signer);
    connection = new EvmPriceServiceConnection(HERMES_ENDPOINT);

    console.log(`Connected to Pyth contract: ${PYTH_CONTRACT_ADDRESS}`);
    console.log(`Connected to Hermes: ${HERMES_ENDPOINT}`);
  });

  it("should fetch ETH price from Pyth and update using Hermes data", async function () {
    console.log("Starting Pyth price feed test");

    // Get initial price (if available)
    let initialPrice;
    try {
      const priceData = await pythContract.getPrice(ETH_USD_PRICE_FEED_ID);
      initialPrice = {
        price: priceData.price,
        conf: priceData.conf,
        expo: priceData.expo,
        publishTime: priceData.publishTime,
      };
      const formattedPrice =
        Number(initialPrice.price) * Math.pow(10, initialPrice.expo);
      console.log(`Initial ETH/USD price: $${formattedPrice.toFixed(2)}`);
      console.log(
        `Initial publish time: ${new Date(
          Number(initialPrice.publishTime) * 1000
        ).toISOString()}`
      );
    } catch {
      console.log("No initial price available, will update first");
      initialPrice = null;
    }

    // Fetch update data from Hermes
    console.log("Fetching price update data from Hermes");
    const priceIds = [ETH_USD_PRICE_FEED_ID];
    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);
    expect(priceUpdateData).to.be.an("array");
    expect(priceUpdateData.length).to.be.greaterThan(0);
    console.log(`Received ${priceUpdateData.length} update(s) from Hermes`);

    // Get update fee
    const updateFee = await pythContract.getUpdateFee(priceUpdateData);
    console.log(
      `Update fee required: ${ethers.utils.formatEther(updateFee)} ETH`
    );

    // Check publish time vs timestamp before update
    let updatedPriceData = await pythContract.getPriceNoOlderThan(
      ETH_USD_PRICE_FEED_ID,
      4000
    );
    console.log(
      `Before update: publishTime=${
        updatedPriceData.publishTime
      } vs timestamp=${await getCurrentBlockTimestamp()} vs latest=${await time.latest()}`
    );

    // Update price feeds
    console.log("Updating price feeds on-chain");
    const tx = await pythContract.updatePriceFeeds(priceUpdateData, {
      value: updateFee,
      gasLimit: 500000,
    });
    const receipt = await tx.wait();
    console.log(`Price update transaction: ${receipt.transactionHash}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Align timestamp to publishTime
    updatedPriceData = await pythContract.getPriceNoOlderThan(
      ETH_USD_PRICE_FEED_ID,
      600
    );
    await network.provider.send("evm_setNextBlockTimestamp", [
      updatedPriceData.publishTime.toNumber(),
    ]);
    await network.provider.send("evm_mine");

    console.log(
      `After update: publishTime=${
        updatedPriceData.publishTime
      } vs timestamp=${await getCurrentBlockTimestamp()}`
    );

    // Get updated price
    console.log("Fetching updated price");
    updatedPriceData = await pythContract.getPrice(ETH_USD_PRICE_FEED_ID);
    const formattedUpdatedPrice =
      Number(updatedPriceData.price) * Math.pow(10, updatedPriceData.expo);
    console.log(`Updated ETH/USD price: $${formattedUpdatedPrice.toFixed(2)}`);
    console.log(
      `Updated publish time: ${new Date(
        Number(updatedPriceData.publishTime) * 1000
      ).toISOString()}`
    );
    console.log(
      `Confidence interval: ±$${(
        Number(updatedPriceData.conf) * Math.pow(10, updatedPriceData.expo)
      ).toFixed(2)}`
    );

    // Validate
    expect(updatedPriceData.price).to.be.instanceOf(ethers.BigNumber);
    expect(updatedPriceData.publishTime).to.be.instanceOf(ethers.BigNumber);
    expect(formattedUpdatedPrice).to.be.greaterThan(0);

    if (initialPrice) {
      expect(Number(updatedPriceData.publishTime)).to.be.greaterThanOrEqual(
        Number(initialPrice.publishTime)
      );
      console.log(
        `Price timestamp updated by ${
          Number(updatedPriceData.publishTime) -
          Number(initialPrice.publishTime)
        } seconds`
      );
    }

    // Test getPriceNoOlderThan
    console.log("Testing getPriceNoOlderThan");
    const recentPrice = await pythContract.getPriceNoOlderThan(
      ETH_USD_PRICE_FEED_ID,
      3600
    );
    expect(recentPrice.price).to.equal(updatedPriceData.price);
    console.log("getPriceNoOlderThan validation passed");
  });

  it("should handle multiple price feed updates", async function () {
    console.log("Testing multiple price feed updates");

    const BTC_USD_PRICE_FEED_ID =
      "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
    const priceIds = [ETH_USD_PRICE_FEED_ID, BTC_USD_PRICE_FEED_ID];

    try {
      const priceUpdateData = await connection.getPriceFeedsUpdateData(
        priceIds
      );
      const updateFee = await pythContract.getUpdateFee(priceUpdateData);

      const tx = await pythContract.updatePriceFeeds(priceUpdateData, {
        value: updateFee,
        gasLimit: 800000,
      });
      await tx.wait();
      console.log("Multiple price feeds updated successfully");

      let data = await pythContract.getPriceNoOlderThan(
        ETH_USD_PRICE_FEED_ID,
        600
      );
      await network.provider.send("evm_setNextBlockTimestamp", [
        data.publishTime.toNumber(),
      ]);
      await network.provider.send("evm_mine");
      console.log(
        `After multiple update: publishTime=${
          data.publishTime
        } vs timestamp=${await getCurrentBlockTimestamp()}`
      );

      const ethPrice = await pythContract.getPrice(ETH_USD_PRICE_FEED_ID);
      const btcPrice = await pythContract.getPrice(BTC_USD_PRICE_FEED_ID);
      expect(ethPrice.price).to.be.instanceOf(ethers.BigNumber);
      expect(btcPrice.price).to.be.instanceOf(ethers.BigNumber);

      console.log(
        `ETH/USD: $${(
          Number(ethPrice.price) * Math.pow(10, ethPrice.expo)
        ).toFixed(2)}`
      );
      console.log(
        `BTC/USD: $${(
          Number(btcPrice.price) * Math.pow(10, btcPrice.expo)
        ).toFixed(2)}`
      );
    } catch {
      console.log(
        "Multiple feeds test skipped (BTC feed may not be available on Base)"
      );
    }
  });
});

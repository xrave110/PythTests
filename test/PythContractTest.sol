// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console2} from "forge-std/Test.sol";
import {PythContract} from "../src/PythContract.sol";
import {MockPyth} from "@pythnetwork/pyth-sdk-solidity/MockPyth.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

contract PythContractTest is Test {
    MockPyth public pyth;
    IPyth public pythFork;
    bytes32 ETH_PRICE_FEED_ID = bytes32(uint256(0x1));
    PythContract public app;

    uint256 ETH_TO_WEI = 10 ** 18;

    bytes32 constant ETH_PRICE_FEED_ID_BASE = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    address constant PYTH_BASE = 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a;

    uint256 public arbitrumFork;
    uint256 public constant BASE_CHAIN_ID = 8453;
    uint256 public constant FORK_BLOCK_NUMBER = 32069438;

    function setUp() public {
        pyth = new MockPyth(60, 1);
        app = new PythContract(address(pyth), ETH_PRICE_FEED_ID);
    }

    function setUpFork() public {
        pythFork = IPyth(PYTH_BASE);
        // Get Arbitrum RPC URL from environment
        string memory arbitrumRpcUrl = vm.envString("BASE_RPC_URL");

        // Create fork at specific block number
        arbitrumFork = vm.createSelectFork(arbitrumRpcUrl, FORK_BLOCK_NUMBER);

        // Assertions to verify fork setup
        assertEq(block.chainid, BASE_CHAIN_ID, "Chain ID mismatch");
        assertEq(block.number, FORK_BLOCK_NUMBER, "Block number mismatch");

        console2.log("=== Arbitrum Fork Setup Complete ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Block number:", block.number);
        console2.log("Block timestamp:", block.timestamp);

        pyth = new MockPyth(60, 1);
        app = new PythContract(address(pythFork), ETH_PRICE_FEED_ID_BASE);
    }

    function createEthUpdate(int64 ethPrice) private view returns (bytes[] memory) {
        bytes[] memory updateData = new bytes[](1);
        console2.log("Mock address: ", address(pyth));
        // pyth.check();
        console2.log("createPriceFeedUpdateData: ");
        updateData[0] = pyth.createPriceFeedUpdateData(
            ETH_PRICE_FEED_ID,
            ethPrice * 100000, // price
            10 * 100000, // confidence
            -5, // exponent
            ethPrice * 100000, // emaPrice
            10 * 100000, // emaConfidence
            uint64(block.timestamp), // publishTime
            uint64(block.timestamp) // prevPublishTime
        );

        return updateData;
    }

    function setEthPrice(int64 ethPrice) private {
        bytes[] memory updateData = createEthUpdate(ethPrice);
        uint256 value = pyth.getUpdateFee(updateData);
        vm.deal(address(this), value);
        pyth.updatePriceFeeds{value: value}(updateData);
    }

    function testMint() public {
        setEthPrice(100);

        vm.deal(address(this), ETH_TO_WEI);
        app.mint{value: ETH_TO_WEI / 100}();
    }

    function testMintRevert() public {
        setEthPrice(99);

        vm.deal(address(this), ETH_TO_WEI);
        vm.expectRevert();
        app.mint{value: ETH_TO_WEI / 100}();
    }

    function testMintStalePrice() public {
        setEthPrice(100);

        skip(120);

        vm.deal(address(this), ETH_TO_WEI);
        vm.expectRevert();
        app.mint{value: ETH_TO_WEI / 100}();
    }

    function testUpdateAndMint() public {
        bytes[] memory updateData = createEthUpdate(100);

        vm.deal(address(this), ETH_TO_WEI);
        app.updateAndMint{value: ETH_TO_WEI / 100}(updateData);
    }

    // function testUpdateAndMintFork() public {
    //     setUpFork();
    //     console2.log("CreateEthUpdate");
    //     bytes[] memory updateData = createEthUpdate(100);

    //     console2.log("Dealing");
    //     vm.deal(address(this), ETH_TO_WEI);
    //     console2.log("update and mint");
    //     app.updateAndMint{value: ETH_TO_WEI / 100}(updateData);
    // }
}
